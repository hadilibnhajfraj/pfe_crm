// lib/forms/view/sections/location_section.dart
//
// Step 4 — Address, map, and notes.
//
// Architecture:
//   • _LocationBody is StatefulWidget solely to own the debounce Timer and
//     Nominatim suggestion list — pure UI state that doesn't belong in the
//     business controller.
//   • Map + coordinates use Obx reading c.latitude / c.longitude directly.
//   • No setState() leaks into parent or sibling widgets.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';

import 'package:dash_master_toolkit/forms/controller/project_form_controller.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/view/widgets/crm_widgets.dart';
import 'package:dash_master_toolkit/services/location_service.dart';
import 'package:dash_master_toolkit/widgets/common_app_widget.dart';
import 'package:dash_master_toolkit/widgets/map_picker_widget.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

class LocationSection extends StatelessWidget {
  final ProjectFormController c;
  final bool isMobile;

  const LocationSection({super.key, required this.c, required this.isMobile});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // Obx reads c.isProject → c.projectModele.value → correct.
        Obx(() {
          if (c.isProject) return _LocationBody(c: c);
          if (c.isApplicateur) {
            return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const CrmSectionTitle(
                  title: 'Adresse', icon: Icons.location_on_rounded),
              const SizedBox(height: 12),
              CrmTextField(
                  label: 'Adresse applicateur',
                  controller: c.localisationAdresse,
                  validator: (v) => c.requiredValidator(v, 'Adresse')),
            ]);
          }
          // Revendeur
          return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const CrmSectionTitle(
                title: 'Adresse', icon: Icons.location_on_rounded),
            const SizedBox(height: 12),
            CrmTextField(
                label: 'Adresse revendeur',
                controller: c.adresseRevendeur,
                validator: (v) => c.requiredValidator(v, 'Adresse')),
          ]);
        }),

        const SizedBox(height: 20),
        const CrmSectionTitle(
            title: 'Notes', icon: Icons.comment_outlined),
        const SizedBox(height: 12),
        CrmTextField(
            label: 'Comments (optional)',
            controller: c.commentaireCtrl,
            keyboardType: TextInputType.multiline,
            maxLines: 4),
      ]),
    );
  }
}

// ── Project location body (map + address search) ──────────────────────────────
// StatefulWidget only for the debounce timer and suggestion list.

class _LocationBody extends StatefulWidget {
  final ProjectFormController c;

  const _LocationBody({required this.c});

  @override
  State<_LocationBody> createState() => _LocationBodyState();
}

class _LocationBodyState extends State<_LocationBody> {
  Timer? _debounce;
  List<NominatimLocation> _suggestions = [];
  bool _searching = false;
  bool _showDropdown = false;
  String? _searchError;

  ProjectFormController get c => widget.c;

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  void _onChanged(String value) {
    _debounce?.cancel();
    final query = value.trim();
    if (query.length < 3) {
      if (mounted) {
        setState(() {
          _suggestions = [];
          _showDropdown = false;
          _searchError = null;
        });
      }
      return;
    }
    _debounce = Timer(
        const Duration(milliseconds: 600), () => _search(query));
  }

  Future<void> _search(String query) async {
    if (!mounted) return;
    setState(() {
      _searching = true;
      _searchError = null;
      _showDropdown = true;
    });
    try {
      final results = await LocationService.searchPlaces(query);
      if (!mounted) return;
      setState(() {
        _suggestions = results;
        _searchError =
            results.isEmpty ? 'No results found in Tunisia' : null;
        _searching = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _suggestions = [];
        _searchError = 'Search failed. Try again.';
        _searching = false;
      });
    }
  }

  void _select(NominatimLocation loc) {
    if (!mounted) return;
    setState(() {
      _showDropdown = false;
      _suggestions = [];
      _searchError = null;
    });
    c.setLocation(
      lat: loc.latitude,
      lng: loc.longitude,
      address: loc.displayName,
      forceAddressUpdate: true,
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const CrmSectionTitle(
          title: 'Location', icon: Icons.location_on_rounded),
      const SizedBox(height: 12),

      // Address text field
      TextFormField(
        controller: c.localisationAdresse,
        autocorrect: false,
        enableSuggestions: false,
        autofillHints: const [],
        textCapitalization: TextCapitalization.none,
        keyboardType: TextInputType.text,
        smartDashesType: SmartDashesType.disabled,
        smartQuotesType: SmartQuotesType.disabled,
        onChanged: _onChanged,
        validator: (v) {
          final hasAddr = v != null && v.trim().isNotEmpty;
          final hasCoords =
              c.latitude.value != null && c.longitude.value != null;
          if (!hasAddr && !hasCoords) {
            return AppLocalizations.of(context).translate('Location is required');
          }
          return null;
        },
        decoration: inputDecoration(context,
            hintText: AppLocalizations.of(context).translate('Type address or use the map below')),
      ),

      // Suggestions dropdown — plain setState, no Obx needed here
      if (_showDropdown) _SuggestionsDropdown(
        theme: theme,
        searching: _searching,
        error: _searchError,
        suggestions: _suggestions,
        onSelect: _select,
      ),

      const SizedBox(height: 16),

      // Map — Obx reads c.latitude / c.longitude directly → valid.
      Obx(() {
        final lat = c.latitude.value;
        final lng = c.longitude.value;
        return MapPickerWidget(
          initialLocation:
              (lat != null && lng != null) ? LatLng(lat, lng) : null,
          initialAddress: c.localisationAdresse.text.trim().isEmpty
              ? null
              : c.localisationAdresse.text.trim(),
          onLocationSelected: (location, address) {
            final empty = c.localisationAdresse.text.trim().isEmpty;
            c.setLocation(
              lat: location.latitude,
              lng: location.longitude,
              address: empty ? address : null,
              forceAddressUpdate: false,
            );
          },
          height: 360,
          showSearchBar: true,
          showCurrentLocationButton: true,
          showFullscreenButton: true,
        );
      }),

      const SizedBox(height: 12),

      // Coordinate status banner — Obx reads lat/lng directly → valid.
      Obx(() {
        final lat = c.latitude.value;
        final lng = c.longitude.value;
        if (lat == null || lng == null) {
          return const CrmStatusBanner(
            color: Colors.orange,
            icon: Icons.info_outline,
            text:
                'Tap the map, use GPS, or search to select a location',
          );
        }
        return CrmStatusBanner(
          color: Colors.green,
          icon: Icons.check_circle,
          text:
              'Location selected: ${lat.toStringAsFixed(5)}, ${lng.toStringAsFixed(5)}',
          trailing: InkWell(
            onTap: () async {
              final url =
                  'https://www.google.com/maps?q=$lat,$lng';
              await launchUrl(Uri.parse(url));
            },
            child: Text(AppLocalizations.of(context).translate('View on Maps'),
                style: const TextStyle(
                    color: Colors.blue,
                    decoration: TextDecoration.underline,
                    fontSize: 12)),
          ),
        );
      }),

      // Location error banner — Obx reads c.locationError directly → valid.
      Obx(() {
        if (c.locationError.value.isEmpty) return const SizedBox.shrink();
        return CrmStatusBanner(
          color: Colors.red,
          icon: Icons.error_outline,
          text: c.locationError.value,
        );
      }),
    ]);
  }
}

// ── Suggestions dropdown (plain StatefulWidget child, no GetX) ────────────────

class _SuggestionsDropdown extends StatelessWidget {
  final ThemeData theme;
  final bool searching;
  final String? error;
  final List<NominatimLocation> suggestions;
  final void Function(NominatimLocation) onSelect;

  const _SuggestionsDropdown({
    required this.theme,
    required this.searching,
    required this.error,
    required this.suggestions,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    Widget content;
    if (searching) {
      content = const Padding(
        padding: EdgeInsets.symmetric(vertical: 16),
        child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
      );
    } else if (error != null) {
      content = Padding(
        padding: const EdgeInsets.all(14),
        child: Text(AppLocalizations.of(context).translate(error!),
            style:
                theme.textTheme.bodyMedium?.copyWith(color: Colors.black54)),
      );
    } else if (suggestions.isEmpty) {
      return const SizedBox.shrink();
    } else {
      content = ConstrainedBox(
        constraints: const BoxConstraints(maxHeight: 200),
        child: ListView.separated(
          shrinkWrap: true,
          padding: EdgeInsets.zero,
          itemCount: suggestions.length,
          separatorBuilder: (_, __) =>
              Divider(height: 1, color: Colors.grey[200]),
          itemBuilder: (_, i) {
            final r = suggestions[i];
            return ListTile(
              dense: true,
              leading: const Icon(Icons.location_on, size: 18),
              title: Text(r.displayName,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodyMedium),
              onTap: () => onSelect(r),
            );
          },
        ),
      );
    }

    return Container(
      margin: const EdgeInsets.only(top: 4),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.grey[300]!),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withOpacity(0.1),
              blurRadius: 6,
              offset: const Offset(0, 3))
        ],
      ),
      child: content,
    );
  }
}
