// Menu Production dynamique : les machines viennent du référentiel
// (MachineCatalog ← GET /machines), jamais d'une liste codée en dur.
// Logique pure (machine_menu.dart, machine_catalog.dart) — exécutable sur
// la VM Dart, sans navigateur.

import 'package:flutter_test/flutter_test.dart';

import 'package:dash_master_toolkit/forms/industrial/model/machine_menu.dart';
import 'package:dash_master_toolkit/forms/industrial/model/machine_model.dart';
import 'package:dash_master_toolkit/forms/industrial/service/machine_catalog.dart';

MachineModel machine(String type, int numero, {String statut = 'ACTIVE'}) => MachineModel(
      id: '$type-$numero',
      code: '$type-${numero.toString().padLeft(2, '0')}',
      nom: 'Machine $type $numero',
      typeMachine: type,
      numero: numero,
      statut: statut,
    );

// Référentiel après ajout de PROBAR-05 et PROMESH-05 ; PROMESH-03 désactivée.
// Volontairement dans le désordre : le menu doit trier par numéro.
final referentiel = [
  machine('PROBAR', 5),
  for (var n = 1; n <= 4; n++) machine('PROBAR', n),
  for (var n = 1; n <= 5; n++) machine('PROMESH', n, statut: n == 3 ? 'INACTIVE' : 'ACTIVE'),
];

void main() {
  group('F/G/H — menu Production construit depuis le référentiel Machines', () {
    test('G. PROBAR-05 apparaît automatiquement, trié par numéro', () {
      final e = machineMenuEntries('/production/probar', 'PROBAR', referentiel);
      expect(e.map((x) => x.name).toList(), ['PROBAR-01', 'PROBAR-02', 'PROBAR-03', 'PROBAR-04', 'PROBAR-05']);
      expect(e.last.path, '/production/probar/machine/5');
    });

    test('H. PROMESH-05 apparaît ; PROMESH-03 désactivée n\'est plus proposée', () {
      final e = machineMenuEntries('/production/promesh', 'PROMESH', referentiel);
      expect(e.map((x) => x.name).toList(), ['PROMESH-01', 'PROMESH-02', 'PROMESH-04', 'PROMESH-05']);
      expect(e.last.path, '/production/promesh/machine/5');
    });

    test('regroupement par type : aucune machine PROMESH dans PROBAR et inversement', () {
      expect(machineMenuEntries('/production/probar', 'PROBAR', referentiel).every((x) => x.name.startsWith('PROBAR-')), isTrue);
      expect(machineMenuEntries('/production/promesh', 'PROMESH', referentiel).every((x) => x.name.startsWith('PROMESH-')), isTrue);
    });

    test('F. aucune machine codée en dur : référentiel vide → aucun sous-menu', () {
      expect(machineMenuEntries('/production/probar', 'PROBAR', const []), isEmpty);
    });
  });

  group('I — MachineCatalog : source unique des écrans industriels', () {
    setUp(() => MachineCatalog.instance.setMachinesForTest(referentiel));
    tearDown(() => MachineCatalog.instance.reset());

    test('ofType filtre par type et, sur demande, les machines inactives', () {
      expect(MachineCatalog.instance.ofType('PROMESH').length, 5);
      expect(MachineCatalog.instance.ofType('PROMESH', activeOnly: true).map((m) => m.numero).toSet(), {1, 2, 4, 5});
      expect(MachineCatalog.instance.ofType('PROBAR', activeOnly: true).length, 5);
    });

    test('équipements de maintenance : machines actives (format historique) + hors référentiel', () {
      final eq = MachineCatalog.instance.maintenanceEquipements();
      expect(eq, containsAll(['PROBAR — Machine 5', 'PROMESH — Machine 5']));
      expect(eq, isNot(contains('PROMESH — Machine 3')));
      expect(eq.sublist(eq.length - 2), ['Mélangeur', 'Autre équipement']);
    });

    test('find retrouve le code d\'une machine (fiche récupérables verrouillée)', () {
      expect(MachineCatalog.instance.find('probar', 5)?.code, 'PROBAR-05');
      expect(MachineCatalog.instance.find('PROBAR', 9), isNull);
    });

    test('reset vide le catalogue (déconnexion)', () {
      MachineCatalog.instance.reset();
      expect(MachineCatalog.instance.machines, isEmpty);
      expect(MachineCatalog.instance.isLoaded, isFalse);
    });
  });
}
