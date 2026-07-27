import 'dart:async';
import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import '../../services/address_service.dart';

class LocationPickerResult {
  final double lat;
  final double lng;
  final String comment;
  final String address;

  LocationPickerResult({
    required this.lat,
    required this.lng,
    required this.comment,
    required this.address,
  });
}

class LocationPickerScreen extends StatefulWidget {
  const LocationPickerScreen({
    super.key,
    this.initialPosition,
    this.initialAddress,
  });

  final LatLng? initialPosition;
  final String? initialAddress;

  @override
  State<LocationPickerScreen> createState() => _LocationPickerScreenState();
}

class _LocationPickerScreenState extends State<LocationPickerScreen> {
  static const LatLng fallback = LatLng(36.8065, 10.1815); // Tunis

  GoogleMapController? _mapController;

  LatLng? _selected;

  final TextEditingController commentCtrl = TextEditingController();
  final TextEditingController addressCtrl = TextEditingController();

  Timer? _debounce;
  String _lastQuery = "";

  @override
  void initState() {
    super.initState();

    // ✅ pré-remplir si déjà une localisation
    if (widget.initialAddress != null && widget.initialAddress!.trim().isNotEmpty) {
      addressCtrl.text = widget.initialAddress!.trim();
    }
    if (widget.initialPosition != null) {
      _selected = widget.initialPosition;
    }

    addressCtrl.addListener(_onAddressChanged);

    // ✅ si on a déjà lat/lng -> afficher marker + caméra après build
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (_selected != null) {
        await _moveCamera(_selected!, zoom: 16);
        setState(() {}); // force redraw markers web
      }
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    addressCtrl.removeListener(_onAddressChanged);
    commentCtrl.dispose();
    addressCtrl.dispose();
    super.dispose();
  }

  void _onMapCreated(GoogleMapController c) async {
    _mapController = c;

    // ✅ si déjà sélectionné, centre direct
    if (_selected != null) {
      await _moveCamera(_selected!, zoom: 16);
      if (mounted) setState(() {});
    }
  }

  void _onAddressChanged() {
    final q = addressCtrl.text.trim();
    if (q.length < 3) return;
    if (q == _lastQuery) return;

    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 650), () async {
      await _autoLocate(q);
    });
  }

  Set<Marker> get _markers {
    if (_selected == null) return <Marker>{};
    return {
      Marker(
        markerId: const MarkerId("picked"),
        position: _selected!,
        infoWindow: const InfoWindow(title: "Localisation sélectionnée"),
      ),
    };
  }

  Future<void> _moveCamera(LatLng p, {double zoom = 16}) async {
    final mc = _mapController;
    if (mc == null) return;

    // ✅ petit délai (web) pour stabiliser
    await Future.delayed(const Duration(milliseconds: 80));
    await mc.animateCamera(CameraUpdate.newLatLngZoom(p, zoom));
  }

  void _applyLocation(LatLng p) {
    setState(() {
      _selected = p;
    });
  }

  Future<void> _autoLocate(String query) async {
    try {
      final results = await AddressService.search(query);
      if (!mounted || results.isEmpty) return;

      final best = results.first;
      _lastQuery = best.displayName;

      // ⚠️ éviter boucle: ne réécrit que si différent
      final clean = best.displayName.trim();
      if (addressCtrl.text.trim() != clean) {
        addressCtrl.value = addressCtrl.value.copyWith(
          text: clean,
          selection: TextSelection.collapsed(offset: clean.length),
          composing: TextRange.empty,
        );
      }

      final p = LatLng(best.lat, best.lon);
      _applyLocation(p);

      await _moveCamera(p, zoom: 16);

      // ✅ important (web): re-render après move
      if (mounted) setState(() {});
    } catch (_) {}
  }

  Future<void> _onTap(LatLng p) async {
    _applyLocation(p);
    await _moveCamera(p, zoom: 16);
    if (mounted) setState(() {});
  }

  void _save() {
    if (_selected == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Colle une adresse ou clique sur la map.")),
      );
      return;
    }

    Navigator.pop(
      context,
      LocationPickerResult(
        lat: _selected!.latitude,
        lng: _selected!.longitude,
        comment: commentCtrl.text.trim(),
        address: addressCtrl.text.trim(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final target = _selected ?? fallback;

    return Scaffold(
      appBar: AppBar(title: const Text("Choisir une localisation")),
      body: Column(
        children: [
          Expanded(
            child: GoogleMap(
              initialCameraPosition: CameraPosition(
                target: target,
                zoom: _selected == null ? 10 : 16,
              ),
              onMapCreated: _onMapCreated,
              onTap: _onTap,
              markers: _markers,
              // ✅ optionnel: assure interactions web
              zoomControlsEnabled: true,
              myLocationButtonEnabled: false,
            ),
          ),
          
        ],
      ),
    );
  }
}