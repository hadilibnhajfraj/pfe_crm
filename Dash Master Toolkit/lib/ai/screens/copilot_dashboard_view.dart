// lib/ai/screens/copilot_dashboard_view.dart
//
// AI Dashboard — le briefing proactif affiché automatiquement à l'ouverture
// du Copilot (voir CopilotUiController.activeTab, initialisé sur
// CopilotPanelTab.dashboard) : "Bonjour {prénom}", compteurs du jour,
// qualité CRM, cartes de risque/recommandation, graphique, timeline,
// notifications. Reflète 1:1 GET /ai-copilot/dashboard (voir
// Backend Master/src/modules/ai-copilot/services/dashboardBriefing.service.js)
// — jamais une donnée calculée ou inventée côté client.
import 'package:flutter/material.dart';
import 'package:get/get.dart';

import 'package:dash_master_toolkit/theme/theme_controller.dart';

import '../models/copilot_dashboard_briefing.dart';
import '../providers/copilot_dashboard_controller.dart';
import '../providers/proactive_alerts_controller.dart';
import '../theme/copilot_colors.dart';
import '../theme/copilot_text_styles.dart';
import '../widgets/copilot_ai_card.dart';
import '../widgets/copilot_avatar.dart';
import '../widgets/copilot_dashboard_chart.dart';
import '../widgets/copilot_notifications_card.dart';
import '../widgets/copilot_proactive_alert_card.dart';
import '../widgets/copilot_recommendation_card.dart';
import '../widgets/copilot_risk_card.dart';
import '../widgets/copilot_timeline_view.dart';

class CopilotDashboardView extends StatefulWidget {
  /// `controller` par défaut reste le vrai singleton — seam de test (voir
  /// test/ai/screens/copilot_dashboard_view_test.dart).
  CopilotDashboardView({super.key, CopilotDashboardController? controller}) : _controller = controller ?? CopilotDashboardController.to;

  final CopilotDashboardController _controller;

  @override
  State<CopilotDashboardView> createState() => _CopilotDashboardViewState();
}

class _CopilotDashboardViewState extends State<CopilotDashboardView> {
  @override
  void initState() {
    super.initState();
    widget._controller.load();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Get.isRegistered<ThemeController>() ? Get.find<ThemeController>().isDarkMode : false;
    final controller = widget._controller;

    return RefreshIndicator(
      onRefresh: () => controller.load(force: true),
      child: Obx(() {
        final briefing = controller.briefing.value;
        final error = controller.error.value;
        final isLoading = controller.isLoading.value;

        final String stateKey;
        final Widget content;

        if (briefing == null && isLoading) {
          stateKey = 'loading';
          content = const Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator()));
        } else if (briefing == null && error != null) {
          stateKey = 'error';
          content = _ErrorState(message: error, isDark: isDark, onRetry: () => controller.load(force: true));
        } else if (briefing == null) {
          stateKey = 'empty';
          content = const SizedBox.shrink();
        } else {
          stateKey = 'data';
          content = _DashboardContent(briefing: briefing, isDark: isDark);
        }

        // Un fondu enchaîné entre spinner → contenu (ou → erreur) plutôt
        // qu'un remplacement instantané — l'apparition "premium" que
        // Microsoft Copilot applique à chaque changement d'état de son
        // panneau, jamais un contenu qui "saute" brutalement à l'écran.
        return AnimatedSwitcher(
          duration: const Duration(milliseconds: 220),
          switchInCurve: Curves.easeOut,
          switchOutCurve: Curves.easeIn,
          child: KeyedSubtree(key: ValueKey(stateKey), child: content),
        );
      }),
    );
  }
}

class _DashboardContent extends StatelessWidget {
  const _DashboardContent({required this.briefing, required this.isDark});

  final CopilotDashboardBriefing briefing;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      // Relu à chaque rebuild réactif : une alerte reçue EN DIRECT pendant
      // que l'onglet Dashboard est déjà ouvert doit apparaître sans qu'il
      // faille fermer/rouvrir le panneau (voir ProactiveAlertsController).
      final liveAlerts = ProactiveAlertsController.to.alerts;
      return ListView(
          padding: const EdgeInsets.all(14),
          children: [
            _GreetingHeader(greeting: briefing.greeting, isDark: isDark),
            if (liveAlerts.isNotEmpty) ...[
              const SizedBox(height: 18),
              _SectionTitle(title: 'Alertes proactives', isDark: isDark),
              const SizedBox(height: 8),
              for (final alert in liveAlerts) CopilotProactiveAlertCard(alert: alert, isDark: isDark),
            ],
            const SizedBox(height: 18),
            _SectionTitle(title: "Aujourd'hui", isDark: isDark),
            const SizedBox(height: 8),
            _TodayCards(today: briefing.today, crmQuality: briefing.crmQuality, isDark: isDark),
            if (briefing.riskCards.isNotEmpty) ...[
              const SizedBox(height: 20),
              _SectionTitle(title: 'Projets à risque', isDark: isDark),
              const SizedBox(height: 8),
              for (final card in briefing.riskCards) CopilotRiskCardWidget(card: card, isDark: isDark),
            ],
            if (briefing.recommendationCards.isNotEmpty) ...[
              const SizedBox(height: 12),
              _SectionTitle(title: 'Recommandations', isDark: isDark),
              const SizedBox(height: 8),
              for (final suggestion in briefing.recommendationCards) CopilotRecommendationCardWidget(suggestion: suggestion, isDark: isDark),
            ],
            const SizedBox(height: 20),
            _SectionTitle(title: 'Aperçu', isDark: isDark),
            const SizedBox(height: 8),
            CopilotDashboardChart(chart: briefing.chart, isDark: isDark),
            if (briefing.timeline.isNotEmpty) ...[
              const SizedBox(height: 20),
              _SectionTitle(title: 'Échéances', isDark: isDark),
              const SizedBox(height: 4),
              CopilotTimelineView(items: briefing.timeline, isDark: isDark),
            ],
            const SizedBox(height: 20),
            _SectionTitle(title: 'Notifications', isDark: isDark),
            const SizedBox(height: 8),
            CopilotNotificationsCard(isDark: isDark),
            const SizedBox(height: 12),
          ],
        );
    });
  }
}

class _GreetingHeader extends StatelessWidget {
  const _GreetingHeader({required this.greeting, required this.isDark});

  final CopilotGreeting greeting;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    // Jamais "Bonjour null 👋" — sans prénom connu (voir
    // dashboardBriefing.service.js::buildGreeting), une formule neutre.
    final text = greeting.firstName != null ? 'Bonjour ${greeting.firstName} 👋' : 'Bonjour 👋';

    return Row(
      children: [
        const CopilotAvatar(size: 40),
        const SizedBox(width: 12),
        Expanded(child: Text(text, style: CopilotTextStyles.emptyStateTitle(isDark))),
      ],
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.title, required this.isDark});

  final String title;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    return Text(title, style: CopilotTextStyles.suggestionChip(isDark).copyWith(fontSize: 13, color: CopilotColors.mutedText(isDark)));
  }
}

class _TodayCards extends StatelessWidget {
  const _TodayCards({required this.today, required this.crmQuality, required this.isDark});

  final CopilotDashboardCounts today;
  final CopilotCrmQuality crmQuality;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    final cards = <Widget>[
      CopilotAiCard(isDark: isDark, icon: Icons.warning_amber_rounded, label: 'Projets critiques', value: '${today.criticalProjects}', accentColor: const Color(0xFFEF4444)),
      CopilotAiCard(isDark: isDark, icon: Icons.description_outlined, label: 'Devis expirent', value: '${today.expiringQuotes}', accentColor: const Color(0xFFF97316)),
      // urgentInterventions reste `null` (pas 0) pour un rôle sans accès à
      // ce chiffre côté backend (voir dashboardBriefing.service.js) —
      // "—" plutôt qu'un zéro qui laisserait croire à "aucune".
      CopilotAiCard(
        isDark: isDark,
        icon: Icons.build_circle_outlined,
        label: 'Interventions urgentes',
        value: today.urgentInterventions == null ? '—' : '${today.urgentInterventions}',
        accentColor: const Color(0xFFF59E0B),
      ),
      CopilotAiCard(isDark: isDark, icon: Icons.call_outlined, label: 'Clients à relancer', value: '${today.clientsToFollowUp}', accentColor: const Color(0xFF3B82F6)),
      CopilotAiCard(isDark: isDark, icon: Icons.verified_outlined, label: 'Qualité CRM', value: '${crmQuality.score} %', accentColor: const Color(0xFF22C55E)),
    ];

    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 8,
      crossAxisSpacing: 8,
      childAspectRatio: 1.5,
      children: cards,
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.isDark, required this.onRetry});

  final String message;
  final bool isDark;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.cloud_off_rounded, size: 32, color: CopilotColors.mutedText(isDark)),
            const SizedBox(height: 10),
            Text(message, textAlign: TextAlign.center, style: CopilotTextStyles.emptyStateSubtitle(isDark)),
            const SizedBox(height: 12),
            OutlinedButton(onPressed: onRetry, child: const Text('Réessayer')),
          ],
        ),
      ),
    );
  }
}
