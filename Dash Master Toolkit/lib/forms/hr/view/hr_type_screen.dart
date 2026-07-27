// lib/forms/hr/view/hr_type_screen.dart
//
// Écran "Nouvelle demande" — 2 grandes cartes (Congé / Sortie), pensées
// pour un utilisateur qui ne connaît rien à l'informatique : une icône
// énorme, un titre, une courte description, rien d'autre.

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';
import '../theme/hr_theme.dart';

class HrTypeScreen extends StatelessWidget {
  const HrTypeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final screenWidth = MediaQuery.of(context).size.width;
    final isMobile = screenWidth < 700;

    return Scaffold(
      backgroundColor: kCrmBg,
      body: SafeArea(
        child: IndustrialPageBody(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                InkWell(
                  onTap: () => context.go(MyRoute.hrHistoriqueScreen),
                  borderRadius: BorderRadius.circular(8),
                  child: Container(
                    padding: const EdgeInsets.all(7),
                    decoration:
                        BoxDecoration(border: Border.all(color: kCrmBorder), borderRadius: BorderRadius.circular(8)),
                    child: const Icon(Icons.arrow_back_rounded, size: 16, color: kCrmTextSub),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(AppLocalizations.of(context).translate('Nouvelle demande'), style: tInter(fontSize: 22, fontWeight: FontWeight.w900, color: kCrmText)),
                    const SizedBox(height: 2),
                    Text(AppLocalizations.of(context).translate('Choisissez le type de demande'), style: tInter(fontSize: 13, color: kCrmTextSub)),
                  ]),
                ),
              ]),
              const SizedBox(height: 28),
              isMobile
                  ? Column(children: [
                      _TypeCard(
                        emoji: '🏖️',
                        title: 'Demande de congé',
                        description: 'Congé ordinaire ou maladie',
                        color: kHrColor,
                        onTap: () => context.go(MyRoute.hrCongeFormScreen),
                      ),
                      const SizedBox(height: 18),
                      _TypeCard(
                        emoji: '🚪',
                        title: 'Autorisation de sortie',
                        description: 'Sortie ponctuelle sur le temps de travail',
                        color: kHrAccepted,
                        onTap: () => context.go(MyRoute.hrSortieFormScreen),
                      ),
                    ])
                  : Row(children: [
                      Expanded(
                        child: _TypeCard(
                          emoji: '🏖️',
                          title: 'Demande de congé',
                          description: 'Congé ordinaire ou maladie',
                          color: kHrColor,
                          onTap: () => context.go(MyRoute.hrCongeFormScreen),
                        ),
                      ),
                      const SizedBox(width: 20),
                      Expanded(
                        child: _TypeCard(
                          emoji: '🚪',
                          title: 'Autorisation de sortie',
                          description: 'Sortie ponctuelle sur le temps de travail',
                          color: kHrAccepted,
                          onTap: () => context.go(MyRoute.hrSortieFormScreen),
                        ),
                      ),
                    ]),
            ]),
          ),
        ),
      ),
    );
  }
}

class _TypeCard extends StatefulWidget {
  final String emoji;
  final String title;
  final String description;
  final Color color;
  final VoidCallback onTap;

  const _TypeCard({
    required this.emoji,
    required this.title,
    required this.description,
    required this.color,
    required this.onTap,
  });

  @override
  State<_TypeCard> createState() => _TypeCardState();
}

class _TypeCardState extends State<_TypeCard> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: AnimatedScale(
        scale: _hover ? 1.02 : 1.0,
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOut,
        child: Material(
          color: kCrmSurface,
          borderRadius: BorderRadius.circular(24),
          child: InkWell(
            onTap: widget.onTap,
            borderRadius: BorderRadius.circular(24),
            child: Container(
              height: 240,
              padding: const EdgeInsets.all(28),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(24),
                border: Border.all(color: _hover ? widget.color : kCrmBorder, width: _hover ? 1.8 : 1),
                boxShadow: [
                  BoxShadow(
                    color: widget.color.withOpacity(_hover ? 0.22 : 0.08),
                    blurRadius: _hover ? 26 : 14,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Container(
                  width: 76,
                  height: 76,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(color: widget.color.withOpacity(0.12), borderRadius: BorderRadius.circular(20)),
                  child: Text(widget.emoji, style: const TextStyle(fontSize: 40)),
                ),
                const Spacer(),
                Text(AppLocalizations.of(context).translate(widget.title), style: tInter(fontSize: 22, fontWeight: FontWeight.w900, color: kCrmText)),
                const SizedBox(height: 6),
                Text(AppLocalizations.of(context).translate(widget.description), style: tInter(fontSize: 13.5, color: kCrmTextSub)),
                const SizedBox(height: 10),
                Row(children: [
                  Text(AppLocalizations.of(context).translate('Commencer'), style: tInter(fontSize: 14, fontWeight: FontWeight.w800, color: widget.color)),
                  const SizedBox(width: 4),
                  Icon(Icons.arrow_forward_rounded, size: 18, color: widget.color),
                ]),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}
