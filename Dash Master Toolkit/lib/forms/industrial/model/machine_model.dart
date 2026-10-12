// lib/forms/industrial/model/machine_model.dart
//
// Référentiel unique des machines PROBAR + PROMESH (backend : table
// `machines`, routes /machines). PROBAR-01..04 et PROMESH-01..04 sont des
// enregistrements de cette entité, jamais des classes distinctes.

class MachineModel {
  final String id;
  final String code;
  final String nom;
  final String typeMachine; // PROBAR | PROMESH
  final int numero;
  final String statut; // ACTIVE | INACTIVE
  final String? description;

  const MachineModel({
    required this.id,
    required this.code,
    required this.nom,
    required this.typeMachine,
    required this.numero,
    required this.statut,
    this.description,
  });

  bool get isActive => statut == 'ACTIVE';

  /// Route de la page de production de cette machine (le champ `machine`
  /// des fiches vaut son numéro).
  String get productionRoute =>
      '/production/${typeMachine.toLowerCase()}/machine/$numero';

  factory MachineModel.fromJson(Map<String, dynamic> j) => MachineModel(
        id: (j['id'] ?? '').toString(),
        code: (j['code'] ?? '').toString(),
        nom: (j['nom'] ?? '').toString(),
        typeMachine: (j['typeMachine'] ?? '').toString(),
        numero: int.tryParse((j['numero'] ?? '0').toString()) ?? 0,
        statut: (j['statut'] ?? 'ACTIVE').toString(),
        description: j['description']?.toString(),
      );
}
