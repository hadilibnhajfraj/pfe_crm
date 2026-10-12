// lib/forms/industrial/model/machine_menu.dart
//
// Entrées du menu Production d'une ligne (PROBAR / PROMESH), calculées
// depuis le référentiel Machines — logique pure (sans widget ni dépendance
// web) partagée par le menu latéral et testée isolément.

import 'machine_model.dart';

class MachineMenuEntry {
  final String name; // code de la machine, ex. PROBAR-05
  final String path; // page de production, ex. /production/probar/machine/5

  const MachineMenuEntry(this.name, this.path);
}

/// Machines ACTIVES du type [typeMachine], dans l'ordre des numéros. Une
/// machine désactivée ne reçoit plus de fiche : elle n'est pas proposée.
List<MachineMenuEntry> machineMenuEntries(
  String lineRoot,
  String typeMachine,
  List<MachineModel> machines,
) {
  final list = machines.where((m) => m.typeMachine == typeMachine && m.isActive).toList()
    ..sort((a, b) => a.numero.compareTo(b.numero));
  return [for (final m in list) MachineMenuEntry(m.code, '$lineRoot/machine/${m.numero}')];
}
