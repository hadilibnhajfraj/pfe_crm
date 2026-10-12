import 'package:flutter_test/flutter_test.dart';
import 'package:dash_master_toolkit/ai/models/copilot_page_context.dart';

void main() {
  group('CopilotPageContext.project — voir project_form_screen.dart', () {
    test('toJson() reflète le contrat attendu par pageContextFormatter.js (screen/label/data)', () {
      final ctx = CopilotPageContext.project(
        name: 'Villa Sfax',
        client: 'Comptoir X',
        productFamily: 'PROBAR',
        diameterMm: 200,
        budget: '120000',
        status: 'en_cours',
        successRate: '72',
        surface: '450',
      );

      expect(ctx.toJson(), {
        'screen': 'project',
        'label': 'Villa Sfax',
        'data': {
          'client': 'Comptoir X',
          'famille': 'PROBAR',
          'diametre': '200mm',
          'budget': '120000',
          'statut': 'en_cours',
          'tauxReussite': '72',
          'surface': '450',
        },
        'entity': 'project', // Phase 1 : type d'entité canonique
      });
    });

    test('des champs optionnels absents ne créent jamais une entrée avec une valeur null/vide', () {
      final ctx = CopilotPageContext.project(name: 'Villa Sfax');
      expect(ctx.toJson(), {'screen': 'project', 'label': 'Villa Sfax', 'entity': 'project'});
    });
  });

  group('CopilotPageContext.client — voir commercial_contact_list_getx_screen.dart', () {
    test('toJson() inclut la liste des projets (jamais un projet vide filtré incorrectement)', () {
      final ctx = CopilotPageContext.client(
        name: 'Société ABC',
        pipelineStage: 'Négociation',
        projectNames: ['Villa Sfax', 'Immeuble Tunis'],
        relanceCount: 3,
        lastRelanceDate: '2026-01-15',
      );

      expect(ctx.toJson(), {
        'screen': 'client',
        'label': 'Société ABC',
        'data': {
          'pipelineStage': 'Négociation',
          'projets': ['Villa Sfax', 'Immeuble Tunis'],
          'nombreRelances': 3,
          'derniereRelance': '2026-01-15',
        },
        'entity': 'commercial_contact',
      });
    });

    test('une liste de projets vide est omise, jamais un tableau vide envoyé pour rien', () {
      final ctx = CopilotPageContext.client(name: 'Société ABC', projectNames: []);
      expect(ctx.toJson()['data'], isNot(contains('projets')));
    });
  });

  group('CopilotPageContext.dashboard — voir dashboard_screen.dart', () {
    test('toJson() reflète KPI + alertes (relances en retard) + priorités (relances à venir)', () {
      final ctx = CopilotPageContext.dashboard(
        totalProjects: 42,
        validated: 30,
        nonValidated: 8,
        validRate: '71.4%',
        overdueFollowups: 3,
        todayFollowups: 2,
        upcomingFollowups: 5,
      );

      expect(ctx.toJson(), {
        'screen': 'dashboard',
        'label': 'Tableau de bord',
        'data': {
          'totalProjets': 42,
          'projetsValides': 30,
          'projetsNonValides': 8,
          'tauxValidation': '71.4%',
          'relancesEnRetard': 3,
          'relancesAujourdhui': 2,
          'relancesAVenir': 5,
        },
      });
    });

    test('zero est une valeur réelle, jamais traitée comme "absente"', () {
      final ctx = CopilotPageContext.dashboard(totalProjects: 0, overdueFollowups: 0);
      expect(ctx.toJson()['data'], {'totalProjets': 0, 'relancesEnRetard': 0});
    });
  });

  group('CopilotPageContext.industrial — voir por_promesh_detail_screen.dart / probar_detail_screen.dart', () {
    test('toJson() pour une fiche PROMESH (diamètres de maille, conformité)', () {
      final ctx = CopilotPageContext.industrial(
        family: 'PROMESH',
        machine: 'M2',
        poste: 'matin',
        diameters: ['12mm', '14mm', '16mm'],
        conformite: 'non_conforme',
        nonConformiteDescription: 'Maille déformée',
      );

      expect(ctx.label, 'PROMESH — M2');
      expect(ctx.toJson()['data'], {
        'famille': 'PROMESH',
        'poste': 'matin',
        'diametres': ['12mm', '14mm', '16mm'],
        'conformite': 'non_conforme',
        'nonConformite': 'Maille déformée',
      });
    });

    test('toJson() pour une fiche PROBAR — jamais de champ "commande" fabriqué quand non fourni', () {
      final ctx = CopilotPageContext.industrial(family: 'PROBAR', machine: 'L1', poste: 'nuit');
      expect(ctx.toJson()['data'], isNot(contains('commande')));
    });

    test('un orderRef explicite est inclus quand réellement fourni', () {
      final ctx = CopilotPageContext.industrial(family: 'PROBAR', orderRef: 'BC-2026-042');
      expect(ctx.toJson()['data'], contains('commande'));
      expect(ctx.toJson()['data']['commande'], 'BC-2026-042');
    });

    test('sans machine, le label reste juste la famille', () {
      final ctx = CopilotPageContext.industrial(family: 'PROMESH');
      expect(ctx.label, 'PROMESH');
    });
  });
}
