// lib/forms/industrial/view/machine_shift_screen.dart
//
// Page "Machine N" — affiche les 2 postes (Matin / Nuit). Le tap ouvre
// directement le formulaire de fiche correspondant (POR PROMESH pour la
// ligne PROMESH, ProbarFormScreen pour PROBAR) avec machine+poste préremplis.

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';
import '../theme/industrial_theme.dart';

class MachineShiftScreen extends StatelessWidget {
  final String line; // 'promesh' | 'probar'
  final String machineNum; // '1'..'4'
  final Color color;
  final String lineLabel; // 'PROMESH' | 'PROBAR'

  const MachineShiftScreen({
    super.key,
    required this.line,
    required this.machineNum,
    required this.color,
    required this.lineLabel,
  });

  void _openForm(BuildContext context, String poste) {
    if (line == 'promesh') {
      // Parcours opérateur : Machine → Poste → Dashboard du poste (KPI +
      // graphiques + liste des fiches) → "+ Nouvelle fiche" pour entrer dans
      // la saisie (jamais le wizard complet, ni la saisie directement).
      context.go('${MyRoute.productionPromeshRoot}/machine/$machineNum/poste/$poste/dashboard');
      return;
    }
    context.go('${MyRoute.productionProbarRoot}/machine/$machineNum/poste/$poste/dashboard');
  }

  @override
  Widget build(BuildContext context) {
    final isPromesh = line == 'promesh';
    // "Poste Soir" est le libellé demandé pour PROMESH — PROBAR garde "Poste
    // Nuit" (hors périmètre de cette refonte), même valeur backend ('nuit').
    final eveningTitle = isPromesh ? 'Poste Soir' : 'Poste Nuit';
    final eveningSubtitle = isPromesh ? 'Démarrer une fiche pour le poste du soir' : 'Démarrer une fiche pour le poste de nuit';
    final morningColor = isPromesh ? kCrmWarning : color;
    final eveningColor = isPromesh ? kPersonnelColor : color;

    return Scaffold(
      backgroundColor: kCrmBg,
      body: SafeArea(
        child: IndustrialPageBody(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              InkWell(
                onTap: () => context.go(
                  line == 'promesh' ? MyRoute.productionPromeshRoot : MyRoute.productionProbarRoot,
                ),
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  padding: const EdgeInsets.all(7),
                  decoration: BoxDecoration(border: Border.all(color: kCrmBorder), borderRadius: BorderRadius.circular(8)),
                  child: const Icon(Icons.arrow_back_rounded, size: 16, color: kCrmTextSub),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                  '${AppLocalizations.of(context).translate(lineLabel)} — ${AppLocalizations.of(context).translate('Machine $machineNum')}',
                  style: tInter(fontSize: 22, fontWeight: FontWeight.w900, color: kCrmText)),
              const SizedBox(height: 2),
              Text(AppLocalizations.of(context).translate('Choisissez le poste pour démarrer une fiche'),
                  style: tInter(fontSize: 13, color: kCrmTextSub)),
              const SizedBox(height: 24),
              // PROMESH : couleurs distinctes Matin/Soir (indépendantes de la
              // couleur de la ligne) pour des cartes "très visibles".
              BigActionCard(
                icon: Icons.wb_sunny_rounded,
                title: AppLocalizations.of(context).translate('Poste Matin'),
                subtitle: AppLocalizations.of(context)
                    .translate('Démarrer une fiche pour le poste du matin'),
                color: morningColor,
                onTap: () => _openForm(context, 'matin'),
              ),
              const SizedBox(height: 16),
              BigActionCard(
                icon: Icons.nightlight_round,
                title: AppLocalizations.of(context).translate(eveningTitle),
                subtitle: AppLocalizations.of(context).translate(eveningSubtitle),
                color: eveningColor,
                onTap: () => _openForm(context, 'nuit'),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}
