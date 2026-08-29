// lib/ai/models/copilot_page_context.dart
//
// Context Awareness — décrit où se trouve l'utilisateur dans l'app au
// moment d'envoyer un message au Copilot (fiche projet/client, tableau de
// bord, fiche industrielle). Envoyé automatiquement avec chaque message
// (voir CopilotController._runAssistantTurn) — jamais à l'utilisateur de le
// répéter dans sa question. Le contrat JSON exact (`{screen, label, data}`)
// est reflété côté backend par
// Backend Master/src/modules/ai-copilot/services/pageContextFormatter.js —
// tout changement de forme ici doit rester synchronisé avec ce fichier.
enum CopilotScreenType { project, client, dashboard, industrial }

extension _ScreenTypeName on CopilotScreenType {
  String get wireName => switch (this) {
        CopilotScreenType.project => 'project',
        CopilotScreenType.client => 'client',
        CopilotScreenType.dashboard => 'dashboard',
        CopilotScreenType.industrial => 'industrial',
      };
}

class CopilotPageContext {
  const CopilotPageContext({required this.screenType, required this.label, required this.data});

  final CopilotScreenType screenType;
  final String label;
  final Map<String, dynamic> data;

  Map<String, dynamic> toJson() => {
        'screen': screenType.wireName,
        if (label.isNotEmpty) 'label': label,
        if (data.isNotEmpty) 'data': data,
      };

  /// Fiche projet — voir lib/forms/view/project_form_screen.dart
  /// (ProjectFormController) : nom/client/activité(famille+diamètre)/
  /// budget/statut/KPI (taux de réussite, surface prospectée).
  factory CopilotPageContext.project({
    required String name,
    String? client,
    String? productFamily,
    int? diameterMm,
    String? budget,
    String? status,
    String? successRate,
    String? surface,
  }) {
    return CopilotPageContext(
      screenType: CopilotScreenType.project,
      label: name,
      data: {
        if (client != null && client.isNotEmpty) 'client': client,
        if (productFamily != null && productFamily.isNotEmpty) 'famille': productFamily,
        if (diameterMm != null) 'diametre': '${diameterMm}mm',
        if (budget != null && budget.isNotEmpty) 'budget': budget,
        if (status != null && status.isNotEmpty) 'statut': status,
        if (successRate != null && successRate.isNotEmpty) 'tauxReussite': successRate,
        if (surface != null && surface.isNotEmpty) 'surface': surface,
      },
    );
  }

  /// Fiche client — voir lib/application/users/model/commercial_contact_model.dart
  /// (CommercialContact) : nom/pipeline/projets liés/historique de relances
  /// (utilisé ici comme équivalent "devis").
  factory CopilotPageContext.client({
    required String name,
    String? pipelineStage,
    List<String>? projectNames,
    int? relanceCount,
    String? lastRelanceDate,
  }) {
    return CopilotPageContext(
      screenType: CopilotScreenType.client,
      label: name,
      data: {
        if (pipelineStage != null && pipelineStage.isNotEmpty) 'pipelineStage': pipelineStage,
        if (projectNames != null && projectNames.isNotEmpty) 'projets': projectNames,
        if (relanceCount != null) 'nombreRelances': relanceCount,
        if (lastRelanceDate != null && lastRelanceDate.isNotEmpty) 'derniereRelance': lastRelanceDate,
      },
    );
  }

  /// Tableau de bord — voir lib/dashboard/academic/view/dashboard_screen.dart
  /// (_DashboardScreenState._loadAll) : KPI globaux + alertes (relances en
  /// retard) + priorités (relances du jour/à venir).
  factory CopilotPageContext.dashboard({
    int? totalProjects,
    int? validated,
    int? nonValidated,
    String? validRate,
    int? overdueFollowups,
    int? todayFollowups,
    int? upcomingFollowups,
  }) {
    return CopilotPageContext(
      screenType: CopilotScreenType.dashboard,
      label: 'Tableau de bord',
      data: {
        if (totalProjects != null) 'totalProjets': totalProjects,
        if (validated != null) 'projetsValides': validated,
        if (nonValidated != null) 'projetsNonValides': nonValidated,
        if (validRate != null && validRate.isNotEmpty) 'tauxValidation': validRate,
        if (overdueFollowups != null) 'relancesEnRetard': overdueFollowups,
        if (todayFollowups != null) 'relancesAujourdhui': todayFollowups,
        if (upcomingFollowups != null) 'relancesAVenir': upcomingFollowups,
      },
    );
  }

  /// Fiche industrielle (Probar ou Promesh) — voir
  /// lib/forms/por_promesh/model/por_promesh_model.dart (PorPromeshModel) et
  /// lib/forms/industrial/view/probar/widgets/probar_detail_data.dart
  /// (ProbarDetailData). `family` : 'PROBAR' | 'PROMESH'. Pas de champ
  /// "commande" dans ces modèles (vérifié contre le vrai code) — `orderRef`
  /// reste optionnel et n'est renseigné que si l'appelant en a réellement
  /// un à donner, jamais une valeur inventée.
  factory CopilotPageContext.industrial({
    required String family,
    String? machine,
    String? poste,
    List<String>? diameters,
    String? conformite,
    String? nonConformiteDescription,
    String? orderRef,
  }) {
    return CopilotPageContext(
      screenType: CopilotScreenType.industrial,
      label: '$family${machine != null ? ' — $machine' : ''}',
      data: {
        'famille': family,
        if (poste != null && poste.isNotEmpty) 'poste': poste,
        if (diameters != null && diameters.isNotEmpty) 'diametres': diameters,
        if (conformite != null && conformite.isNotEmpty) 'conformite': conformite,
        if (nonConformiteDescription != null && nonConformiteDescription.isNotEmpty) 'nonConformite': nonConformiteDescription,
        if (orderRef != null && orderRef.isNotEmpty) 'commande': orderRef,
      },
    );
  }
}
