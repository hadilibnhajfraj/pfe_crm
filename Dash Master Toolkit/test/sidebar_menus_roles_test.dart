// Régression : un SidebarItemType.submenu doit toujours avoir des enfants.
// Avant correction, PROMESH / PROBAR étaient déclarés « submenu » même quand le
// référentiel Machines n'était pas encore chargé (premier rendu après la
// connexion de responsable_logistique_achat, /por-promesh/dashboard) :
// submenus vide → assertion de SidebarItemModel.

import 'package:flutter_test/flutter_test.dart';

import 'package:dash_master_toolkit/app_shell_route/components/sidebar/sidebar_widget.dart';
import 'package:dash_master_toolkit/forms/industrial/model/machine_model.dart';

MachineModel machine(String type, int numero, {String statut = 'ACTIVE'}) => MachineModel(
      id: '$type-$numero',
      code: '$type-${numero.toString().padLeft(2, '0')}',
      nom: 'Machine $type $numero',
      typeMachine: type,
      numero: numero,
      statut: statut,
    );

final referentiel = [
  for (var n = 1; n <= 4; n++) machine('PROBAR', n),
  for (var n = 1; n <= 4; n++) machine('PROMESH', n),
];

// Chaque combinaison de rôle utilisée par la sidebar (sidebar_widget.dart).
final roles = <String, List<GroupedMenuModel> Function(List<MachineModel>)>{
  'responsable_logistique_achat': (m) => buildGroupedMenus(
      isAdmin: false, isCommercialSedentaire: false, isAccueil: false,
      isLogistiqueAchat: true, canViewPorPromesh: true, machines: m),
  'commercial': (m) => buildGroupedMenus(
      isAdmin: false, isCommercialSedentaire: false, isAccueil: false, isCommercial: true, machines: m),
  'commercial_sedentaire': (m) => buildGroupedMenus(
      isAdmin: false, isCommercialSedentaire: true, isAccueil: false, machines: m),
  'accueil': (m) => buildGroupedMenus(
      isAdmin: false, isCommercialSedentaire: false, isAccueil: true, machines: m),
  'admin / superadmin / superadmin2': (m) => buildGroupedMenus(
      isAdmin: true, isCommercialSedentaire: false, isAccueil: false,
      canViewPorPromesh: true, isRootAdmin: true, machines: m),
};

Iterable<SidebarItemModel> allItems(List<GroupedMenuModel> groups) => groups.expand((g) => g.menus);

void main() {
  for (final entry in roles.entries) {
    for (final loaded in [false, true]) {
      test('${entry.key} — référentiel ${loaded ? "chargé" : "vide"} : aucun submenu vide', () {
        final groups = entry.value(loaded ? referentiel : const []);
        for (final item in allItems(groups)) {
          if (item.sidebarItemType == SidebarItemType.submenu) {
            expect(item.submenus, isNotEmpty, reason: item.name);
          }
        }
      });
    }
  }

  test('RLA : sans machine chargée, PROMESH / PROBAR absents mais Machines, Mélange, Maintenance, RH, Récupérables présents', () {
    final groups = roles['responsable_logistique_achat']!(const []);
    final names = allItems(groups).map((i) => i.name).toList();
    expect(names, isNot(contains('PROMESH')));
    expect(names, isNot(contains('PROBAR')));
    expect(names, contains('Machines'));
    expect(groups.map((g) => g.name), containsAll(['PRODUCTION', 'MÉLANGE', 'MAINTENANCE', 'RH', 'RÉCUPÉRABLES']));
  });

  test('RLA : une fois le référentiel chargé, PROMESH / PROBAR listent les machines actives', () {
    final items = allItems(roles['responsable_logistique_achat']!(referentiel));
    final promesh = items.firstWhere((i) => i.name == 'PROMESH');
    final probar = items.firstWhere((i) => i.name == 'PROBAR');
    expect(promesh.submenus!.map((s) => s.name), ['PROMESH-01', 'PROMESH-02', 'PROMESH-03', 'PROMESH-04']);
    expect(probar.submenus!.length, 4);
  });

  test('une ligne dont toutes les machines sont inactives n\'est pas proposée', () {
    final items = allItems(roles['responsable_logistique_achat']!([
      machine('PROBAR', 1),
      machine('PROMESH', 1, statut: 'INACTIVE'),
    ]));
    expect(items.map((i) => i.name), contains('PROBAR'));
    expect(items.map((i) => i.name), isNot(contains('PROMESH')));
  });
}
