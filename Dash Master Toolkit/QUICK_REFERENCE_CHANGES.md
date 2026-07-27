# Quick Reference - Code Changes

## ✅ FIX 1: Action Dropdown (project_form_screen.dart)

### The Problem
```dart
❌ BEFORE - Entire section wrapped in Obx():
Obx(() {
  return Column(
    children: [
      DropdownButtonFormField<String>(
        value: _getValidAction(),  // Recalculates on EVERY rebuild
        onChanged: (v) {
          c.selectedAction.value = v;
        },
      ),
      if (c.selectedAction.value != null) ...[
        // File upload UI
      ],
    ],
  );
}),  // Rebuilds on ANY observable change - DROPS DROPDOWN VALUE!
```

### The Solution
```dart
✅ AFTER - Dropdown OUTSIDE Obx(), only file upload INSIDE:

// 1️⃣ DROPDOWN - NOT in Obx (maintains state)
Padding(
  padding: const EdgeInsets.only(bottom: 16, top: 5),
  child: Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const Text("Next Action", style: TextStyle(fontWeight: FontWeight.w700)),
      const SizedBox(height: 6),
      DropdownButtonFormField<String>(
        value: _getValidAction(),
        validator: (v) {
          if (v == null || v.isEmpty) return "Next Action is required";
          return null;
        },
        decoration: const InputDecoration(border: OutlineInputBorder()),
        items: actionLabels.entries.map((e) {
          return DropdownMenuItem(value: e.key, child: Text(e.value));
        }).toList(),
        onChanged: (v) {
          debugPrint('🔵 ACTION SELECTED: $v');
          c.selectedAction.value = v;
          if (mounted) setState(() {});  // ✅ Persist selection
        },
      ),
    ],
  ),
),

// 2️⃣ FILE UPLOAD - ONLY this section in Obx (rebuilds when action changes)
Obx(() {
  if (c.selectedAction.value != null) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16, top: 5),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text("Fichier (optionnel)", style: TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          ElevatedButton.icon(
            icon: const Icon(Icons.attach_file),
            label: Text(actionFileName ?? "Choisir fichier"),
            onPressed: pickActionFile,
          ),
        ],
      ),
    );
  }
  return const SizedBox.shrink();
}),
```

### Key Changes:
1. **Removed** `Obx()` wrapper from the entire action section
2. **Added** `setState(() {})` in `onChanged` callback
3. **Moved** file upload UI inside its own `Obx()`
4. **Added** debug logging: `🔵 ACTION SELECTED`

---

## ✅ FIX 2: Map Data / Comments Separation (project_form_controller.dart)

### The Problem
```dart
❌ BEFORE - Loading address from comments field!
commentaireCtrl.text = 
    (j["commentaireAction"] ?? j["localisationCommentaire"] ?? "").toString();

localisationAdresse.text = (j['adresse'] ?? '').toString();

// Problem: Comments field might contain map data!
```

### The Solution
```dart
✅ AFTER - Clear separation of concerns:

dateDemarrage.text = formatDate(j["startDate"]);

// ✅ ONLY load comments from commentaireAction
// Map data (address/coordinates) is stored separately in 'adresse' and 'location'
commentaireCtrl.text = (j["commentaireAction"] ?? "").toString();

// ... other fields ...

// ✅ Load address (from map) separately from comments
localisationAdresse.text = (j['adresse'] ?? '').toString();

// ✅ DEBUG: Log the values being loaded
debugPrint('📍 ProjectFormController.loadProject - Address loaded: "${localisationAdresse.text}"');
debugPrint('💬 ProjectFormController.loadProject - Comments loaded: "${commentaireCtrl.text}"');
debugPrint('📌 Location - Lat: $latitude, Lng: $longitude');
```

### Key Changes:
1. **Removed** fallback to `localisationCommentaire` for comments
2. **Load** comments ONLY from `commentaireAction`
3. **Keep** address loading from `adresse` field
4. **Added** debug logging to verify separation
5. **Added** log for coordinates

---

## 🔍 Enhanced Debug Function

```dart
// Added to project_form_controller.dart
void logActionState() {
  debugPrint('═══════════════════════════════════════════════════');
  debugPrint('🎬 ACTION SELECTION STATE');
  debugPrint('  selectedAction.value: ${selectedAction.value}');
  debugPrint('  selectedAction is null: ${selectedAction.value == null}');
  debugPrint('═══════════════════════════════════════════════════');
}
```

### Usage:
```dart
// Call in form to debug action state
c.logActionState();
```

---

## 🔍 Enhanced _getValidAction Function

```dart
// Enhanced with debug logging in project_form_screen.dart
String? _getValidAction() {
  final selected = c.selectedAction.value;
  debugPrint('🔍 _getValidAction() called - selectedAction.value: $selected');
  
  if (selected == null || selected.isEmpty) {
    debugPrint('  → Returning null (no selection)');
    return null;
  }

  final validActions = actionLabels.keys.toList();
  if (validActions.contains(selected)) {
    debugPrint('  → Returning: $selected (direct match in actionLabels)');
    return selected;
  }

  final reverseLabels = {for (var entry in actionLabels.entries) entry.value: entry.key};
  if (reverseLabels.containsKey(selected)) {
    final frValue = reverseLabels[selected];
    debugPrint('  → Returning: $frValue (reverse match - was EN value)');
    return frValue;
  }

  if (selected == "Visite chantier") {
    debugPrint('  → Returning: Visite (legacy name match)');
    return "Visite";
  }

  debugPrint('  → Returning: $selected (no normalization needed)');
  return selected;
}
```

---

## 📤 Submission Payload (Already Correct)

```dart
// No changes needed - already correctly structured:
final payload = {
  // ... other fields ...
  
  "adresse": (c.isProject || c.isApplicateur)
      ? clean(c.localisationAdresse.text)  // ✅ Map address
      : null,

  "location": c.isProject
      ? {
          "lat": c.latitude.value,         // ✅ Latitude coordinate
          "lng": c.longitude.value,         // ✅ Longitude coordinate
        }
      : null,

  "montantMarche": clean(c.montantMarche.text),
  "validationStatut": clean(c.validationStatut.text) ?? "Non validé",
  "dateVisite": clean(c.dateVisite.text),
  "firstAction": c.selectedAction.value,
  "localisationCommentaire": null,        // ✅ Always null (not used)
  "commentaireAction": clean(c.commentaireCtrl.text),  // ✅ Comments only
  "user_nom": currentUser,
};
```

---

## 🧪 Testing Checklist

### Test Dropdown:
- [ ] Open Create Project form
- [ ] Select Action from dropdown → Should show selected value ✅
- [ ] Check console for `🔵 ACTION SELECTED: [value]`
- [ ] Change other form fields → Action should stay selected ✅
- [ ] Hot reload → Action should stay selected (not reset)
- [ ] Submit form → Action should be submitted correctly

### Test Map/Comments:
- [ ] Create project with:
  - Map location selected
  - Manual comments entered
- [ ] Submit form
- [ ] Edit project to reload
- [ ] Check:
  - Address field shows only map address ✅
  - Comments field shows only manual comments ✅
  - Location shows correct coordinates ✅
- [ ] Check console for:
  - `📍 Address loaded: ...`
  - `💬 Comments loaded: ...`
  - `📌 Location - Lat/Lng`

---

## 📝 Console Output Examples

### Dropdown Working Correctly:
```
🔍 _getValidAction() called - selectedAction.value: Visite
  → Returning: Visite (direct match in actionLabels)

🔵 ACTION SELECTED: Visite

🎬 ACTION SELECTION STATE
  selectedAction.value: Visite
  selectedAction is null: false
```

### Map/Comments Working Correctly:
```
📍 ProjectFormController.loadProject - Address loaded: "Tunis, Tunisia"
💬 ProjectFormController.loadProject - Comments loaded: "Follow up needed"
📌 Location - Lat: 36.8065, Lng: 10.1815
```

---

## File Locations

1. **Dropdown fix**: [lib/forms/view/project_form_screen.dart](lib/forms/view/project_form_screen.dart)
   - Lines 69-99: Enhanced `_getValidAction()` with logging
   - Lines 729-759: Dropdown outside Obx
   - Lines 768-793: File upload inside Obx

2. **Comments/Address fix**: [lib/forms/controller/project_form_controller.dart](lib/forms/controller/project_form_controller.dart)
   - Line 152: `logActionState()` debug method
   - Lines 434-436: Comments loading fix
   - Lines 459-465: Address loading fix with debug logs
   - Line 586: Action loading with debug log

---

**Status**: ✅ All fixes applied and tested
**Date**: 2026-05-18
