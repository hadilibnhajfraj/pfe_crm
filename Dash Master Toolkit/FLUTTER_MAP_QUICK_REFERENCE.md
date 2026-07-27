# ⚡ Flutter Map 8.3.0 - Quick Reference Guide

## 🎯 Key API Changes from Previous Versions

### MapOptions Constructor Changes
```dart
// ✅ CORRECT (flutter_map 8.3.0)
MapOptions(
  initialCenter: LatLng(36.8065, 10.1815),  // Center point
  initialZoom: 13.0,                         // Zoom level
  onTap: _onMapTap,                          // Tap handler
  onMapReady: _onMapReady,                   // Ready callback (no params)
),

// ❌ OLD (doesn't work)
MapOptions(
  initialZoom: 13.0,
  initialPosition: LatLng(...),              // Changed to initialCenter
  onMapReady: (controller) => {...},         // onMapReady now has NO params
),
```

---

## 🔄 MapController Lifecycle Pattern

### Pattern 1: Initialize Early (Recommended)
```dart
class MyMapWidget extends StatefulWidget {
  @override
  State<MyMapWidget> createState() => _MyMapWidgetState();
}

class _MyMapWidgetState extends State<MyMapWidget> {
  late MapController _mapController;
  bool _mapControllerInitialized = false;
  bool _isMapReady = false;

  @override
  void initState() {
    super.initState();
    _ensureMapControllerInitialized();
  }

  void _ensureMapControllerInitialized() {
    if (!_mapControllerInitialized) {
      try {
        _mapController = MapController();
        _mapControllerInitialized = true;
      } catch (e) {
        print('Error: $e');
      }
    }
  }

  void _onMapReady() {
    setState(() => _isMapReady = true);
  }

  @override
  Widget build(BuildContext context) {
    return FlutterMap(
      mapController: _mapController,  // Pass controller
      options: MapOptions(
        initialCenter: LatLng(36.8065, 10.1815),
        initialZoom: 13.0,
        onMapReady: _onMapReady,  // NO parameters
      ),
    );
  }
}
```

---

## 🛡️ Safe MapController Usage

### Before Using Controller - ALWAYS Check:
```dart
// ✅ Complete safety check pattern
if (mounted && _mapControllerInitialized && _isMapReady) {
  try {
    _mapController.move(location, zoom);
  } catch (e) {
    print('Error: $e');
  }
}
```

### Controller Methods (Only Call When Ready):
```dart
// ✅ These MUST only be called after _isMapReady = true
_mapController.move(location, zoom);        // Move to location
_mapController.rotate(degrees);              // Rotate map
_mapController.fitBounds(bounds);            // Fit bounds
_mapController.rotateWhere(...);             // Conditional rotate
```

---

## ⏰ Async Operations Pattern

### Getting Location Safely:
```dart
Future<void> getCurrentLocationSafely() async {
  try {
    final location = await LocationService.getCurrentLocation();
    
    if (!mounted) return;  // Check mounted
    
    if (location != null) {
      setState(() => _selectedLocation = location);
      
      // Only move camera if ready
      if (_isMapReady && _mapControllerInitialized) {
        _mapController.move(location, 16.0);
      }
    }
  } catch (e) {
    print('Error: $e');
  }
}
```

---

## 🧹 Proper Disposal Pattern

### Always Dispose MapController:
```dart
@override
void dispose() {
  if (_mapControllerInitialized) {
    try {
      _mapController.dispose();
    } catch (e) {
      print('Dispose error: $e');
    }
  }
  super.dispose();
}
```

---

## 📍 LocationService - Null Safety Pattern

### Correct Exception Handling:
```dart
// ✅ CORRECT - Throw exception on timeout
static Future<LatLng?> getCurrentLocation() async {
  try {
    final position = await Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
      ),
    ).timeout(
      const Duration(seconds: 10),
      onTimeout: () {
        throw TimeoutException('Timeout');  // ✅ Throw, don't return null
      },
    );
    
    return LatLng(position.latitude, position.longitude);
  } on TimeoutException {
    return null;  // ✅ Return null at method level
  } catch (e) {
    return null;
  }
}

// ❌ WRONG - Returning null from timeout handler
.timeout(
  const Duration(seconds: 10),
  onTimeout: () => null,  // ❌ This is wrong!
)
```

---

## 🗺️ TileLayer Configuration

### Modern TileLayer Setup:
```dart
TileLayer(
  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  userAgentPackageName: 'com.example.app',
  maxNativeZoom: 19,
  minNativeZoom: 0,
),
```

### Alternative Tile Providers:
```dart
// CartoDB Positron
'https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png'

// CartoDB Voyager
'https://cartodb-basemaps-{s}.global.ssl.fastly.net/rastertiles/voyager/{z}/{x}/{y}.png'

// USGS Topo
'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}'
```

---

## 🎯 Common Issues & Solutions

### Issue 1: "You need to have the FlutterMap widget rendered at least once..."
```dart
// ❌ WRONG - Calling before map renders
void initState() {
  _mapController.move(location, 16);  // Crashes!
}

// ✅ CORRECT - Wait for onMapReady
void _onMapReady() {
  setState(() => _isMapReady = true);
}

if (_isMapReady) {
  _mapController.move(location, 16);
}
```

### Issue 2: "The argument type: void Function(MapController) can't be assigned..."
```dart
// ❌ WRONG - onMapReady with parameters
void _onMapReady(MapController controller) {
  _mapController = controller;
}

// ✅ CORRECT - onMapReady with NO parameters
void _onMapReady() {
  _isMapReady = true;
}

onMapReady: _onMapReady,  // Correct signature
```

### Issue 3: "A value of type 'Null' can't be returned from Future<Position>"
```dart
// ❌ WRONG - Returning null from timeout
.timeout(
  const Duration(seconds: 10),
  onTimeout: () => null,
)

// ✅ CORRECT - Throw exception
.timeout(
  const Duration(seconds: 10),
  onTimeout: () => throw TimeoutException('Timeout'),
)
```

---

## 📦 Dependencies Check

```yaml
flutter_map: ">=8.3.0"  # Correct version
latlong2: ">=0.8.0"     # For LatLng
geolocator: ">=10.0.0"  # For GPS
geocoding: ">=2.0.0"    # For reverse geocoding
```

---

## ✅ Pre-Launch Checklist

- [ ] MapController initialized in initState()
- [ ] onMapReady has correct signature (no parameters)
- [ ] All controller calls check _isMapReady
- [ ] All controller calls check _mapControllerInitialized
- [ ] All setState() calls check mounted
- [ ] LocationService throws TimeoutException
- [ ] MapController disposed properly
- [ ] No null returns from non-nullable Futures
- [ ] Flutter analyze passes with no errors
- [ ] Project compiles successfully

---

## 🚀 Commands Reference

```bash
# Clean and rebuild
flutter clean
flutter pub get

# Analyze code
flutter analyze

# Run on web
flutter run -d chrome --web-port 57745

# Run on Android
flutter run -d android

# Run on iOS
flutter run -d ios

# Build for web
flutter build web

# Build for mobile
flutter build apk
flutter build ios
```

---

## 📚 Useful Links

- [flutter_map GitHub](https://github.com/fleaflet/flutter_map)
- [flutter_map Docs](https://docs.fleaflet.dev/)
- [Geolocator Package](https://pub.dev/packages/geolocator)
- [Geocoding Package](https://pub.dev/packages/geocoding)
- [Flutter Lifecycle Docs](https://flutter.dev/docs/development/lifecycle)

---

**Last Updated:** May 14, 2026  
**Status:** ✅ Production Ready
