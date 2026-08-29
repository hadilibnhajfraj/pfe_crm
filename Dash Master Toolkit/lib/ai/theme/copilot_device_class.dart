// lib/ai/theme/copilot_device_class.dart
//
// Responsive 3 niveaux — mobile/tablette/desktop — dérivé des VRAIS
// `BreakpointName` déjà définis pour toute l'app (lib/constant/breakpoint.dart,
// déjà utilisés par AppShell), jamais un nouveau jeu de seuils inventé.
// `XS` (0-576) = mobile ; `SM`/`MD` (577-1239, "Tablet"/"Large Tablet Size"
// selon leurs propres commentaires) = tablette ; `LG`/`XL` (1240+) = desktop.
//
// Avant cette passe, CopilotFab ne connaissait qu'un seuil BINAIRE
// (`largerThan(MD)`) : une tablette (577-1239px) recevait donc le MÊME
// traitement qu'un téléphone (feuille modale plein écran) — jamais le
// panneau latéral que Microsoft Copilot affiche déjà sur iPad/tablette.
import 'package:flutter/widgets.dart';
import 'package:responsive_framework/responsive_framework.dart' as rf;

import 'package:dash_master_toolkit/constant/breakpoint.dart';

enum CopilotDeviceClass { mobile, tablet, desktop }

CopilotDeviceClass copilotDeviceClassOf(BuildContext context) {
  final breakpoints = rf.ResponsiveBreakpoints.of(context);
  if (breakpoints.largerThan(BreakpointName.MD.name)) return CopilotDeviceClass.desktop;
  if (breakpoints.largerThan(BreakpointName.XS.name)) return CopilotDeviceClass.tablet;
  return CopilotDeviceClass.mobile;
}
