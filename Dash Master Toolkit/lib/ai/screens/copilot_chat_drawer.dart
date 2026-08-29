// lib/ai/screens/copilot_chat_drawer.dart
//
// La présentation DESKTOP/TABLETTE — un panneau qui glisse depuis la droite
// (Scaffold.endDrawer, voir son injection additive dans
// lib/app_shell_route/app_shell.dart), jamais une modale qui recouvre tout
// l'écran : le reste du CRM reste visible/utilisable pendant que le Copilot
// répond, exactement le comportement de Microsoft Copilot dans Office/Edge.
//
// Largeur adaptée à la classe d'appareil (voir copilot_device_class.dart) —
// plus étroit sur tablette que sur desktop, jamais la même largeur fixe
// partout. Fond en verre dépoli (voir copilot_glass_surface.dart) : laisse
// deviner le CRM derrière, l'esthétique "Mica" de Copilot.
import 'package:flutter/material.dart';
import 'package:get/get.dart';

import 'package:dash_master_toolkit/theme/theme_controller.dart';

import '../theme/copilot_device_class.dart';
import '../widgets/copilot_glass_surface.dart';
import 'copilot_panel_body.dart';

const double _kTabletWidth = 360;
const double _kDesktopWidth = 420;

class CopilotChatDrawer extends StatelessWidget {
  const CopilotChatDrawer({super.key});

  @override
  Widget build(BuildContext context) {
    // DIAGNOSTIC TEMPORAIRE (mission "CONFIRMER LA CAUSE DE LA DISPARITION
    // DU COPILOT") — à retirer après le diagnostic.
    // ignore: avoid_print
    print('[COPILOT-DRAWER] build');
    final isDark = Get.isRegistered<ThemeController>() ? Get.find<ThemeController>().isDarkMode : false;
    final deviceClass = copilotDeviceClassOf(context);
    final baseWidth = deviceClass == CopilotDeviceClass.tablet ? _kTabletWidth : _kDesktopWidth;
    final width = baseWidth.clamp(0, MediaQuery.sizeOf(context).width * 0.92).toDouble();

    return Drawer(
      width: width,
      backgroundColor: Colors.transparent,
      elevation: 0,
      shape: const RoundedRectangleBorder(),
      child: CopilotGlassSurface(
        isDark: isDark,
        child: SafeArea(
          child: CopilotPanelBody(onClose: () => Scaffold.of(context).closeEndDrawer()),
        ),
      ),
    );
  }
}
