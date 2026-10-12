// lib/forms/industrial/service/machine_catalog.dart
//
// Catalogue des machines chargé depuis GET /machines — source UNIQUE de la
// liste des machines côté Flutter (menu Production, vue d'une ligne, liste
// POR, récupérables, demandes de maintenance). Aucune machine n'est codée en
// dur : une machine ajoutée en base (PROBAR-05, PROMESH-05…) apparaît
// partout sans modifier le code.
//
// Exposé comme ChangeNotifier (main.dart, ChangeNotifierProvider.value) :
// tout widget qui l'écoute se reconstruit après load()/refresh().

import 'package:flutter/foundation.dart';

import '../model/machine_model.dart';
import 'machine_service.dart';

class MachineCatalog extends ChangeNotifier {
  MachineCatalog._();
  static final MachineCatalog instance = MachineCatalog._();

  static const types = ['PROBAR', 'PROMESH'];

  List<MachineModel> _machines = const [];
  bool _loaded = false;
  bool _loading = false;
  String? _error;

  List<MachineModel> get machines => _machines;
  bool get isLoaded => _loaded;
  String? get error => _error;

  /// Charge le catalogue une seule fois par session (appel idempotent). Après
  /// un échec, ne réessaie pas tout seul (évite une boucle de requêtes à
  /// chaque reconstruction du menu) : seul refresh() relance le chargement.
  Future<void> ensureLoaded() async {
    if (_loaded || _loading || _error != null) return;
    await refresh();
  }

  /// Recharge depuis l'API (après ajout / modification / changement de statut).
  Future<void> refresh() async {
    _loading = true;
    try {
      final list = await MachineService.instance.fetchAll();
      list.sort((a, b) {
        final t = a.typeMachine.compareTo(b.typeMachine);
        return t != 0 ? t : a.numero.compareTo(b.numero);
      });
      _machines = List.unmodifiable(list);
      _error = null;
      _loaded = true;
    } catch (e) {
      _error = e.toString().replaceFirst('Exception: ', '');
      debugPrint('[MachineCatalog] chargement impossible : $_error');
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  /// Tests uniquement : alimente le catalogue sans appel réseau.
  @visibleForTesting
  void setMachinesForTest(List<MachineModel> machines) {
    _machines = List.unmodifiable(machines);
    _loaded = true;
    _error = null;
    notifyListeners();
  }

  /// Vide le catalogue (déconnexion) — rechargé au prochain ensureLoaded().
  void reset() {
    _machines = const [];
    _loaded = false;
    _error = null;
    notifyListeners();
  }

  /// Machines d'un type ('PROBAR' | 'PROMESH'), triées par numéro.
  List<MachineModel> ofType(String type, {bool activeOnly = false}) => _machines
      .where((m) => m.typeMachine == type.toUpperCase() && (!activeOnly || m.isActive))
      .toList();

  /// Équipements proposés dans une demande de maintenance : machines ACTIVES
  /// du référentiel au format historique « PROMESH — Machine N » (reconnu
  /// côté backend par le hook linkMachine), puis les équipements hors
  /// référentiel.
  List<String> maintenanceEquipements() => [
        for (final t in const ['PROMESH', 'PROBAR'])
          for (final m in ofType(t, activeOnly: true)) '$t — Machine ${m.numero}',
        'Mélangeur',
        'Autre équipement',
      ];

  /// Machine d'un type et d'un numéro (null si absente du référentiel).
  MachineModel? find(String type, int numero) {
    for (final m in _machines) {
      if (m.typeMachine == type.toUpperCase() && m.numero == numero) return m;
    }
    return null;
  }
}
