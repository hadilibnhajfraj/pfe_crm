import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import '../services/location_service.dart';
import '../theme/theme_controller.dart';
import 'package:get/get.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

class MapPickerWidget extends StatefulWidget {
  final LatLng? initialLocation;
  final String? initialAddress;
  final Function(LatLng location, String? address)? onLocationSelected;
  final bool showSearchBar;
  final bool showCurrentLocationButton;
  final bool showFullscreenButton;
  final double? height;

  const MapPickerWidget({
    super.key,
    this.initialLocation,
    this.initialAddress,
    this.onLocationSelected,
    this.showSearchBar = true,
    this.showCurrentLocationButton = true,
    this.showFullscreenButton = true,
    this.height = 300,
  });

  @override
  State<MapPickerWidget> createState() => _MapPickerWidgetState();
}

class _MapPickerWidgetState extends State<MapPickerWidget> {
  static const String _tag = 'MapPickerWidget';

  // Fixed defaults — never change between builds; changing initialCenter/initialZoom
  // after first render causes flutter_map to call move() before the controller is ready.
  static const LatLng _tunisCenter = LatLng(36.8065, 10.1815);
  static const double _defaultZoom = 6.5;
  static const double _selectionZoom = 15.0;

  // ── MapController ─────────────────────────────────────────────────────────
  late final MapController _mapController;

  // Guards every _mapController.move() call. Set by flutter_map's onMapReady.
  bool _isMapReady = false;

  // Moves queued before onMapReady fires, executed once ready.
  final List<VoidCallback> _pendingMoves = [];

  // ── Location state ────────────────────────────────────────────────────────
  LatLng? _selectedLocation;
  String? _selectedAddress;

  // Only true after an EXPLICIT user action: tap / GPS / search result.
  // Marker and coordinate bar are hidden until this is true.
  bool _hasUserSelection = false;

  // ── Search state ──────────────────────────────────────────────────────────
  final TextEditingController _searchController = TextEditingController();
  bool _isUpdatingSearchText = false;
  Timer? _searchDebounce;
  List<NominatimLocation> _searchResults = [];
  String? _searchError;
  bool _showSearchSuggestions = false;
  bool _isSearching = false;

  // ── GPS state ─────────────────────────────────────────────────────────────
  bool _isLoadingLocation = false;

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  @override
  void initState() {
    super.initState();
    debugPrint('$_tag: initState — initialLocation=${widget.initialLocation}, platform=${kIsWeb ? "web" : "native"}');

    _mapController = MapController();
    debugPrint('$_tag: MapController created');

    _hasUserSelection = widget.initialLocation != null;
    _selectedLocation = widget.initialLocation;
    _selectedAddress = widget.initialAddress;

    _searchController.addListener(_onSearchChanged);

    if (widget.initialAddress?.trim().isNotEmpty ?? false) {
      _isUpdatingSearchText = true;
      _searchController.text = widget.initialAddress!.trim();
      _isUpdatingSearchText = false;
    }

    debugPrint('$_tag: initState completed — map widget will render immediately');
  }

  @override
  void didUpdateWidget(covariant MapPickerWidget oldWidget) {
    super.didUpdateWidget(oldWidget);

    if (widget.initialLocation != oldWidget.initialLocation &&
        widget.initialLocation != null) {
      final newLoc = widget.initialLocation!;
      if (_selectedLocation != newLoc) {
        debugPrint('$_tag: didUpdateWidget — new location: $newLoc');
        setState(() {
          _selectedLocation = newLoc;
          _hasUserSelection = true;
        });
        _safeMove(newLoc, _selectionZoom);
      }
    }

    if (widget.initialAddress != oldWidget.initialAddress &&
        widget.initialAddress != null) {
      _isUpdatingSearchText = true;
      _searchController.text = widget.initialAddress!.trim();
      _isUpdatingSearchText = false;
      if (mounted) setState(() => _selectedAddress = widget.initialAddress?.trim());
    }
  }

  @override
  void dispose() {
    debugPrint('$_tag: dispose');
    _searchDebounce?.cancel();
    _searchController.dispose();
    _pendingMoves.clear();
    // Do NOT call _mapController.dispose() manually — FlutterMap owns the
    // controller lifecycle in flutter_map 8.x. Manual dispose causes errors
    // on the next frame when FlutterMap tears down.
    super.dispose();
  }

  // ── MapController lifecycle ───────────────────────────────────────────────

  void _onMapReady() {
    debugPrint('$_tag: onMapReady — controller usable, tiles loading');
    if (!mounted) return;

    setState(() => _isMapReady = true);

    // Execute queued moves on the NEXT frame (past current build/layout cycle).
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      debugPrint('$_tag: post-ready frame callback');
      if (_pendingMoves.isNotEmpty) {
        _flushPendingMoves();
      } else if (_hasUserSelection && _selectedLocation != null) {
        debugPrint('$_tag: moving to initial location: $_selectedLocation');
        _moveCamera(_selectedLocation!, _selectionZoom);
      }
    });
  }

  void _flushPendingMoves() {
    if (_pendingMoves.isEmpty) return;
    debugPrint('$_tag: flushing ${_pendingMoves.length} queued move(s)');
    final ops = List<VoidCallback>.from(_pendingMoves);
    _pendingMoves.clear();
    for (final op in ops) {
      try {
        op();
      } catch (e) {
        debugPrint('$_tag: queued move error: $e');
      }
    }
  }

  void _safeMove(LatLng loc, double zoom) {
    if (!_isMapReady) {
      debugPrint('$_tag: map not ready — queuing move to $loc');
      _pendingMoves.add(() => _moveCamera(loc, zoom));
      return;
    }
    _moveCamera(loc, zoom);
  }

  void _moveCamera(LatLng loc, double zoom) {
    if (!mounted || !_isMapReady) return;
    try {
      _mapController.move(loc, zoom);
      debugPrint('$_tag: camera → $loc zoom=$zoom');
    } catch (e) {
      debugPrint('$_tag: _moveCamera error (caught): $e');
    }
  }

  // ── Map tap ───────────────────────────────────────────────────────────────

  Future<void> _onMapTap(TapPosition _, LatLng latLng) async {
    if (!mounted) return;

    // Reject obviously invalid coordinates.
    if (latLng.latitude.isNaN ||
        latLng.longitude.isNaN ||
        latLng.latitude.abs() > 90 ||
        latLng.longitude.abs() > 180) {
      debugPrint('$_tag: invalid tap coordinates $latLng — ignored');
      return;
    }

    debugPrint('$_tag: map tap → $latLng');

    setState(() {
      _selectedLocation = latLng;
      _selectedAddress = null;
      _hasUserSelection = true;
      _showSearchSuggestions = false;
    });

    debugPrint('$_tag: marker rendered at lat=${latLng.latitude}, lng=${latLng.longitude}');

    String? address;
    try {
      address = await LocationService.getAddressFromCoordinates(latLng);
      if (!mounted) return;
      setState(() => _selectedAddress = address);
    } catch (e) {
      debugPrint('$_tag: reverse geocode error: $e');
    }

    debugPrint('$_tag: location selected — lat=${latLng.latitude}, lng=${latLng.longitude}, address=$address');
    widget.onLocationSelected?.call(latLng, address);
  }

  // ── GPS ───────────────────────────────────────────────────────────────────

  Future<void> _getCurrentLocation() async {
    if (!mounted) return;
    setState(() => _isLoadingLocation = true);

    try {
      debugPrint('$_tag: requesting GPS location');
      final loc = await LocationService.getCurrentLocation();
      if (!mounted) return;

      if (loc != null) {
        debugPrint('$_tag: GPS → lat=${loc.latitude}, lng=${loc.longitude}');
        setState(() {
          _selectedLocation = loc;
          _selectedAddress = null;
          _hasUserSelection = true;
        });
        _safeMove(loc, _selectionZoom);

        final address = await LocationService.getAddressFromCoordinates(loc);
        if (!mounted) return;
        if (address != null) setState(() => _selectedAddress = address);

        debugPrint('$_tag: location selected successfully');
        widget.onLocationSelected?.call(loc, address);
      } else {
        // GPS failed — show fallback center on map but do NOT treat as user selection.
        debugPrint('$_tag: GPS unavailable — using fallback ${LocationService.fallbackLocation}');
        _safeMove(LocationService.fallbackLocation, _defaultZoom);
        _showSnackBar('Unable to get GPS location. Tap the map to place a marker.');
      }
    } catch (e) {
      debugPrint('$_tag: GPS error: $e');
      _showSnackBar('Error getting location.');
    } finally {
      if (mounted) setState(() => _isLoadingLocation = false);
    }
  }

  // ── Search ────────────────────────────────────────────────────────────────

  void _onSearchChanged() {
    if (_isUpdatingSearchText) return;

    _searchDebounce?.cancel();

    final query = _searchController.text.trim();

    if (query.isEmpty) {
      if (mounted) {
        setState(() {
          _searchResults.clear();
          _searchError = null;
          _showSearchSuggestions = false;
        });
      }
      return;
    }

    if (query.length < 3) {
      if (mounted) {
        setState(() {
          _searchResults.clear();
          _showSearchSuggestions = false;
        });
      }
      return;
    }

    _searchDebounce = Timer(const Duration(milliseconds: 500), () {
      if (mounted) _performSearch(query);
    });
  }

  Future<void> _performSearch(String query) async {
    if (!mounted || query.trim().isEmpty) return;

    setState(() {
      _isSearching = true;
      _searchError = null;
      _showSearchSuggestions = true;
    });

    try {
      debugPrint('$_tag: search → "$query"');
      final results = await LocationService.searchPlaces(query);
      if (!mounted) return;
      setState(() {
        _searchResults = results;
        _searchError = results.isEmpty ? 'No results found in Tunisia' : null;
        _isSearching = false;
      });
      debugPrint('$_tag: ${results.length} result(s) for "$query"');
    } catch (e) {
      debugPrint('$_tag: search error: $e');
      if (!mounted) return;
      setState(() {
        _searchResults.clear();
        _searchError = 'Search failed. Try again.';
        _isSearching = false;
      });
    }
  }

  void _selectSearchResult(NominatimLocation result) {
    if (!mounted) return;
    final latLng = LatLng(result.latitude, result.longitude);
    debugPrint('$_tag: result selected — "${result.displayName}" @ $latLng');

    _isUpdatingSearchText = true;
    _searchController.text = result.displayName;
    _isUpdatingSearchText = false;

    setState(() {
      _selectedLocation = latLng;
      _selectedAddress = result.displayName;
      _hasUserSelection = true;
      _showSearchSuggestions = false;
      _searchResults.clear();
      _searchError = null;
    });

    _safeMove(latLng, _selectionZoom);
    widget.onLocationSelected?.call(latLng, result.displayName);
  }

  // ── Fullscreen ────────────────────────────────────────────────────────────

  void _openFullscreen() {
    Navigator.of(context).push(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => Scaffold(
          appBar: AppBar(
            title: Text(AppLocalizations.of(context).translate('Select Location')),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(context).pop(),
                child: Text(AppLocalizations.of(context).translate('done')),
              ),
            ],
          ),
          body: MapPickerWidget(
            initialLocation: _selectedLocation,
            initialAddress: _selectedAddress,
            onLocationSelected: (loc, address) {
              if (mounted) {
                setState(() {
                  _selectedLocation = loc;
                  _selectedAddress = address;
                  _hasUserSelection = true;
                });
              }
              widget.onLocationSelected?.call(loc, address);
            },
            showSearchBar: true,
            showCurrentLocationButton: true,
            showFullscreenButton: false,
            height: double.infinity,
          ),
        ),
      ),
    );
  }

  void _showSnackBar(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  // ── Build ─────────────────────────────────────────────────────────────────
  //
  // The map renders IMMEDIATELY — no loading overlay. Tiles load asynchronously
  // and appear as OSM responds. Removing the _mapWidgetBuilt guard eliminates
  // the "Loading map…" stuck state caused by addPostFrameCallback racing with
  // Obx reactive rebuilds that dispose/remount the widget before the callback fires.

  @override
  Widget build(BuildContext context) {
    debugPrint(
      '$_tag: build — _isMapReady=$_isMapReady, '
      '_hasUserSelection=$_hasUserSelection, '
      'platform=${kIsWeb ? "web" : "native"}',
    );

    final theme = Theme.of(context);
    final themeCtrl = Get.find<ThemeController>();
    final isDark = themeCtrl.isDarkMode;

    final hasControls = widget.showSearchBar ||
        widget.showCurrentLocationButton ||
        widget.showFullscreenButton;

    final controlsBg = isDark ? const Color(0xFF2C2C2C) : Colors.white;
    final suggestionsBg = isDark ? const Color(0xFF1E1E1E) : Colors.white;

    debugPrint('$_tag: building FlutterMap with TileLayer (OSM)');

    final card = Card(
      elevation: 4,
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Stack(
        // StackFit.expand: FlutterMap fills the entire SizedBox height.
        fit: StackFit.expand,
        children: [
          // ── FlutterMap — always rendered, no loading guard ──────────────
          FlutterMap(
            mapController: _mapController,
            options: MapOptions(
              initialCenter: _tunisCenter,
              initialZoom: _defaultZoom,
              minZoom: 2.0,
              maxZoom: 19.0,
              onTap: _onMapTap,
              onMapReady: _onMapReady,
              interactionOptions: const InteractionOptions(
                flags: InteractiveFlag.all,
              ),
            ),
            children: [
              // TileLayer: flutter_map 8.x compatible, OSM tiles with CORS support
              TileLayer(
                urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                userAgentPackageName: 'com.example.app',
                maxZoom: 19,
              ),
              // Marker only when user explicitly selected a location
              if (_hasUserSelection && _selectedLocation != null)
                MarkerLayer(
                  markers: [
                    Marker(
                      point: _selectedLocation!,
                      width: 48,
                      height: 48,
                      child: Icon(
                        Icons.location_on,
                        color: theme.primaryColor,
                        size: 40,
                      ),
                    ),
                  ],
                ),
            ],
          ),

          // ── Controls overlay — floats at top ────────────────────────────
          if (hasControls)
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: _buildControlsOverlay(
                  theme, isDark, controlsBg, suggestionsBg),
            ),

          // ── "Tap to place" hint ─────────────────────────────────────────
          if (!_hasUserSelection && !_showSearchSuggestions)
            const Positioned(
              bottom: 70,
              left: 12,
              right: 12,
              child: IgnorePointer(child: _HintBanner()),
            ),

          // ── Coordinate bar — floats at bottom ───────────────────────────
          if (_hasUserSelection && _selectedLocation != null)
            Positioned(
              bottom: 0,
              left: 0,
              right: 0,
              child: _buildCoordBar(theme, isDark),
            ),
        ],
      ),
    );

    // SizedBox with a definite height gives Stack's StackFit.expand the
    // bounded constraints it needs to fill the card correctly.
    final isFixedHeight = widget.height != null && widget.height!.isFinite;
    if (isFixedHeight) {
      return SizedBox(height: widget.height!, child: card);
    }

    // Fullscreen mode: read available height from LayoutBuilder.
    return LayoutBuilder(
      builder: (context, constraints) {
        final h = constraints.maxHeight.isFinite
            ? constraints.maxHeight
            : MediaQuery.sizeOf(context).height;
        return SizedBox(height: h, child: card);
      },
    );
  }

  // ── Controls overlay ──────────────────────────────────────────────────────

  Widget _buildControlsOverlay(
    ThemeData theme,
    bool isDark,
    Color bg,
    Color suggestionsBg,
  ) {
    return Container(
      decoration: BoxDecoration(
        color: bg,
        border: Border(
          bottom: BorderSide(
            color: isDark ? Colors.grey[700]! : Colors.grey[200]!,
            width: 0.5,
          ),
        ),
      ),
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (widget.showSearchBar) ...[
            TextField(
              controller: _searchController,
              autocorrect: false,
              enableSuggestions: false,
              autofillHints: const [],
              smartDashesType: SmartDashesType.disabled,
              smartQuotesType: SmartQuotesType.disabled,
              textCapitalization: TextCapitalization.none,
              keyboardType: TextInputType.text,
              decoration: InputDecoration(
                hintText: AppLocalizations.of(context).translate('Search for a city or place…'),
                prefixIcon: const Icon(Icons.search, size: 20),
                suffixIcon: _isSearching
                    ? const Padding(
                        padding: EdgeInsets.all(10),
                        child: SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                      )
                    : _searchController.text.isNotEmpty
                        ? IconButton(
                            icon: const Icon(Icons.clear, size: 18),
                            onPressed: () {
                              _searchController.clear();
                              if (mounted) {
                                setState(() {
                                  _showSearchSuggestions = false;
                                  _searchResults.clear();
                                  _searchError = null;
                                });
                              }
                            },
                          )
                        : null,
                border:
                    OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                isDense: true,
              ),
            ),
            if (_showSearchSuggestions) ...[
              const SizedBox(height: 4),
              _buildSuggestionsDropdown(theme, isDark, suggestionsBg),
            ],
            const SizedBox(height: 8),
          ],
          Row(
            children: [
              if (widget.showCurrentLocationButton)
                Expanded(
                  child: SizedBox(
                    height: 40,
                    child: ElevatedButton.icon(
                      onPressed:
                          _isLoadingLocation ? null : _getCurrentLocation,
                      icon: _isLoadingLocation
                          ? const SizedBox(
                              width: 14,
                              height: 14,
                              child: CircularProgressIndicator(
                                  strokeWidth: 2, color: Colors.white),
                            )
                          : const Icon(Icons.my_location, size: 16),
                      label: Text(AppLocalizations.of(context).translate('Use Current Location'),
                          style: const TextStyle(fontSize: 13)),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: theme.primaryColor,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8)),
                        padding: EdgeInsets.zero,
                      ),
                    ),
                  ),
                ),
              if (widget.showCurrentLocationButton &&
                  widget.showFullscreenButton)
                const SizedBox(width: 8),
              if (widget.showFullscreenButton)
                SizedBox(
                  height: 40,
                  width: 40,
                  child: IconButton(
                    onPressed: _openFullscreen,
                    icon: const Icon(Icons.fullscreen, size: 20),
                    tooltip: 'Fullscreen',
                    padding: EdgeInsets.zero,
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }

  // ── Search suggestions ────────────────────────────────────────────────────

  Widget _buildSuggestionsDropdown(ThemeData theme, bool isDark, Color bg) {
    return Container(
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(8),
        border:
            Border.all(color: isDark ? Colors.grey[700]! : Colors.grey[300]!),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.12),
            blurRadius: 6,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: _buildSuggestionsContent(theme, isDark),
    );
  }

  Widget _buildSuggestionsContent(ThemeData theme, bool isDark) {
    if (_isSearching) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 16),
        child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
      );
    }

    if (_searchError != null) {
      return Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Icon(Icons.info_outline,
                size: 16,
                color: isDark ? Colors.white54 : Colors.black45),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                _searchError!,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: isDark ? Colors.white54 : Colors.black54,
                ),
              ),
            ),
          ],
        ),
      );
    }

    if (_searchResults.isEmpty) return const SizedBox.shrink();

    return ConstrainedBox(
      constraints: const BoxConstraints(maxHeight: 160),
      child: ListView.separated(
        shrinkWrap: true,
        padding: EdgeInsets.zero,
        itemCount: _searchResults.length,
        separatorBuilder: (_, __) => Divider(
            height: 1,
            color: isDark ? Colors.grey[700] : Colors.grey[200]),
        itemBuilder: (_, i) {
          final r = _searchResults[i];
          return ListTile(
            dense: true,
            leading: const Icon(Icons.location_on, size: 18),
            title: Text(
              r.displayName,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.bodyMedium,
            ),
            subtitle: Text(
              '${r.latitude.toStringAsFixed(5)}, '
              '${r.longitude.toStringAsFixed(5)}',
              style: theme.textTheme.bodySmall,
            ),
            onTap: () => _selectSearchResult(r),
          );
        },
      ),
    );
  }

  // ── Coordinate bar ────────────────────────────────────────────────────────

  Widget _buildCoordBar(ThemeData theme, bool isDark) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: isDark
            ? const Color.fromRGBO(30, 30, 30, 0.92)
            : const Color.fromRGBO(255, 255, 255, 0.95),
        border: Border(
          top: BorderSide(
            color: isDark ? Colors.grey[700]! : Colors.grey[200]!,
            width: 0.5,
          ),
        ),
      ),
      child: Row(
        children: [
          const Icon(Icons.check_circle, size: 16, color: Colors.green),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              'Lat: ${_selectedLocation!.latitude.toStringAsFixed(6)},  '
              'Lng: ${_selectedLocation!.longitude.toStringAsFixed(6)}',
              style:
                  theme.textTheme.bodySmall?.copyWith(color: Colors.green[700]),
            ),
          ),
          if (_selectedAddress != null && _selectedAddress!.isNotEmpty)
            Flexible(
              child: Text(
                _selectedAddress!,
                style:
                    theme.textTheme.bodySmall?.copyWith(color: Colors.grey[600]),
                textAlign: TextAlign.right,
                overflow: TextOverflow.ellipsis,
                maxLines: 1,
              ),
            ),
        ],
      ),
    );
  }
}

// ── Stateless hint banner ─────────────────────────────────────────────────────

class _HintBanner extends StatelessWidget {
  const _HintBanner();

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: isDark
            ? const Color.fromRGBO(0, 0, 0, 0.65)
            : const Color.fromRGBO(255, 255, 255, 0.92),
        borderRadius: BorderRadius.circular(8),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.08),
            blurRadius: 4,
          ),
        ],
      ),
      child: Row(
        children: [
          const Icon(Icons.touch_app, size: 18, color: Colors.blueGrey),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Tap the map to place a marker',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
        ],
      ),
    );
  }
}
