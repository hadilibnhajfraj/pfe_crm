// lib/ai/widgets/copilot_fab.dart
//
// Le point d'entrée du Copilot, présent sur TOUTE page authentifiée — voir
// son injection additive dans lib/app_shell_route/app_shell.dart
// (`floatingActionButton: const CopilotFab()`, `endDrawer: const
// CopilotChatDrawer()`). Décide lui-même drawer (desktop) vs bottom sheet
// (mobile) via le même seuil de largeur que AppShell
// (`BreakpointName.MD`, voir lib/constant/breakpoint.dart) — jamais une
// page de chat séparée qu'il faudrait naviguer pour atteindre.
import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../providers/copilot_ui_controller.dart';
import '../screens/copilot_chat_bottom_sheet.dart';
import '../theme/copilot_colors.dart';
import '../theme/copilot_device_class.dart';
import 'copilot_avatar.dart';

class CopilotFab extends StatelessWidget {
  const CopilotFab({super.key});

  @override
  Widget build(BuildContext context) {
    // DIAGNOSTIC TEMPORAIRE (mission "CONFIRMER LA CAUSE DE LA DISPARITION
    // DU COPILOT") — à retirer après le diagnostic.
    // ignore: avoid_print
    print('[COPILOT-FAB] build');
    final ui = CopilotUiController.to;

    return Obx(() {
      // Une fois le panneau ouvert (drawer desktop OU bottom sheet mobile),
      // le FAB s'efface : jamais deux points d'entrée superposés à
      // l'écran en même temps.
      if (ui.isOpen.value) return const SizedBox.shrink();

      return FloatingActionButton(
        heroTag: 'copilot-fab',
        tooltip: 'Ouvrir le Copilot IA',
        backgroundColor: Colors.transparent,
        elevation: 6,
        onPressed: () => _open(context, ui),
        child: Container(
          decoration: const BoxDecoration(
            shape: BoxShape.circle,
            gradient: CopilotColors.orbLinearGradient,
          ),
          child: const Padding(
            padding: EdgeInsets.all(8),
            child: CopilotAvatar(size: 28),
          ),
        ),
      );
    });
  }

  void _open(BuildContext context, CopilotUiController ui) {
    // Mobile → feuille modale (voir CopilotChatBottomSheet) ; tablette ET
    // desktop → panneau latéral (CopilotChatDrawer, qui adapte lui-même sa
    // largeur selon la classe d'appareil — voir sa propre doc). Avant
    // cette passe, seul `largerThan(MD)` était testé : une tablette
    // (577-1239px) recevait la MÊME feuille plein écran qu'un téléphone.
    final deviceClass = copilotDeviceClassOf(context);
    ui.showChat();

    if (deviceClass != CopilotDeviceClass.mobile) {
      // Le vrai statut ouvert/fermé du drawer desktop/tablette est piloté
      // par `Scaffold.onEndDrawerChanged` (voir app_shell.dart) — pas ici —
      // pour rester correct même quand l'utilisateur ferme le drawer d'un
      // swipe ou d'un tap en dehors, pas seulement via ce bouton.
      Scaffold.of(context).openEndDrawer();
      return;
    }

    ui.open();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const CopilotChatBottomSheet(),
    ).whenComplete(ui.close);
  }
}
