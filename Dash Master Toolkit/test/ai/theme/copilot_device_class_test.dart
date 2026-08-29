import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:responsive_framework/responsive_framework.dart' as rf;

import 'package:dash_master_toolkit/ai/theme/copilot_device_class.dart';
import 'package:dash_master_toolkit/constant/breakpoint.dart';

// Fournit directement un rf.ResponsiveBreakpointsData avec une largeur
// contrôlée, via son propre InheritedWidget — plutôt que de simuler une
// taille de fenêtre et laisser le widget STATEFUL rf.ResponsiveBreakpoints
// (WidgetsBindingObserver, redimensionnement asynchrone sur
// didChangeMetrics) la recalculer, ce qui s'est avéré peu fiable à
// synchroniser dans un simple pumpWidget() de test. Cette approche teste
// UNIQUEMENT copilotDeviceClassOf() — jamais la mécanique interne de
// responsive_framework, qui n'est pas de notre responsabilité.
const _breakpoints = [
  rf.Breakpoint(start: 0, end: 576, name: 'XS'),
  rf.Breakpoint(start: 577, end: 904, name: 'SM'),
  rf.Breakpoint(start: 905, end: 1239, name: 'MD'),
  rf.Breakpoint(start: 1240, end: 1439, name: 'LG'),
  rf.Breakpoint(start: 1440, end: double.infinity, name: 'XL'),
];

Widget _withScreenWidth(double width, Widget Function(BuildContext) builder) {
  return rf.InheritedResponsiveBreakpoints(
    data: rf.ResponsiveBreakpointsData(screenWidth: width, breakpoints: _breakpoints),
    child: MaterialApp(home: Builder(builder: builder)),
  );
}

void main() {
  test('les seuils réels de l\'app (BreakpointName) correspondent exactement aux seuils utilisés ici — jamais deux définitions qui pourraient diverger', () {
    expect(BreakpointName.XS.end, 576);
    expect(BreakpointName.MD.end, 1239);
  });

  testWidgets('un téléphone (XS, <576) classe en mobile', (tester) async {
    CopilotDeviceClass? result;
    await tester.pumpWidget(_withScreenWidth(400, (context) {
      result = copilotDeviceClassOf(context);
      return const SizedBox();
    }));
    expect(result, CopilotDeviceClass.mobile);
  });

  testWidgets('une tablette (SM, 577-904) classe en tablette — ni mobile ni desktop', (tester) async {
    CopilotDeviceClass? result;
    await tester.pumpWidget(_withScreenWidth(800, (context) {
      result = copilotDeviceClassOf(context);
      return const SizedBox();
    }));
    expect(result, CopilotDeviceClass.tablet);
  });

  testWidgets('une grande tablette (MD, jusqu\'à 1239) classe encore en tablette', (tester) async {
    CopilotDeviceClass? result;
    await tester.pumpWidget(_withScreenWidth(1100, (context) {
      result = copilotDeviceClassOf(context);
      return const SizedBox();
    }));
    expect(result, CopilotDeviceClass.tablet);
  });

  testWidgets('un laptop/desktop (LG/XL, 1240+) classe en desktop', (tester) async {
    CopilotDeviceClass? result;
    await tester.pumpWidget(_withScreenWidth(1400, (context) {
      result = copilotDeviceClassOf(context);
      return const SizedBox();
    }));
    expect(result, CopilotDeviceClass.desktop);
  });

  testWidgets('la frontière exacte tablette/desktop (905, juste après MD.start) reste tablette, jamais desktop', (tester) async {
    CopilotDeviceClass? result;
    await tester.pumpWidget(_withScreenWidth(905, (context) {
      result = copilotDeviceClassOf(context);
      return const SizedBox();
    }));
    expect(result, CopilotDeviceClass.tablet);
  });

  testWidgets('la frontière exacte tablette/desktop (1240, LG.start) bascule en desktop', (tester) async {
    CopilotDeviceClass? result;
    await tester.pumpWidget(_withScreenWidth(1240, (context) {
      result = copilotDeviceClassOf(context);
      return const SizedBox();
    }));
    expect(result, CopilotDeviceClass.desktop);
  });
}
