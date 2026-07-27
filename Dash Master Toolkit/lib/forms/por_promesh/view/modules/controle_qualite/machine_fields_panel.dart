// lib/forms/por_promesh/view/modules/controle_qualite/machine_fields_panel.dart
//
// "Contrôle Machine" — état général machine (7 champs : air, niveauBainEau,
// temperatureEau, temperaturePistons, etatPistons, fluideVisuel,
// etatDisqueCoupe). Les champs "Niveau bain résine", "État d'Atelier" et
// "Zone de Stockage" ont été supprimés (hors périmètre du contrôle
// machine) et "Température demandée" a été renommée "Température des
// Pistons" — saisie numérique libre, sans boutons préréglés.
//
// SEUL contenu de `ControleMachineScreen` — "Contrôle Process" et
// "Paramètres du Poste" ne sont plus des sections/écrans manuels (le
// backend les génère automatiquement à partir de ces mêmes 7 champs, voir
// `applyDerivedProcessControl` côté serveur).
//
// Pas d'en-tête de carte ici (le titre "Contrôle Machine" est déjà affiché
// par le header de la page, `ModuleScaffold` → `ModuleHeaderSection`) —
// grille de cartes directement sous le header, pour une page compacte
// sans chrome dupliqué. Chaque carte à choix (RxnString) porte son propre
// `Obx` — se redessine seule à la sélection, sans jamais reconstruire ce
// panneau ni la page.
//
// AUCUNE hauteur fixe passée aux cartes (plus de `height:` — le paramètre
// a été retiré de `ParameterCard`/`NumericCard`, remplacé par
// `constraints: BoxConstraints(minHeight: 110)` sur chaque carte) : chaque
// carte se dimensionne à son propre contenu. `MachineControlGrid` répartit
// la grille via un simple `Wrap` (largeur calculée par carte, 1 à 4
// colonnes selon l'écran) — AUCUN `IntrinsicHeight` nulle part dans ce
// module (une tentative précédente avec `IntrinsicHeight` provoquait
// "Cannot hit test a render box with no size", `StatusSelector` utilisant
// un `LayoutBuilder` non mesurable en intrinsèque).

import 'package:flutter/material.dart';
import 'package:get/get.dart';

import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/por_promesh/controller/por_promesh_controller.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

import 'cq_theme.dart';
import 'machine_control_grid.dart';
import 'parameter_card.dart';
import 'numeric_card.dart';
import 'status_selector.dart';

class MachineFieldsPanel extends StatelessWidget {
  final PorPromeshController c;
  final VoidCallback onChanged;

  const MachineFieldsPanel({super.key, required this.c, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return MachineControlGrid(cards: [
      Obx(() => ParameterCard(
            icon: cqMachineFieldIcon(CqMachineField.air),
            title: "Pression d'air",
            value: c.air.value,
            options: const [
              StatusOption(value: '< 6 bars', label: '< 6 bars', icon: Icons.circle, color: kCrmDanger),
              StatusOption(value: '> 6 bars', label: '> 6 bars', icon: Icons.circle, color: kCrmSuccess),
            ],
            onSelect: (v) {
              c.air.value = v;
              onChanged();
            },
          )),
      Obx(() => ParameterCard(
            icon: cqMachineFieldIcon(CqMachineField.niveauBainEau),
            title: "Niveau Bain d'eau",
            value: c.niveauBainEau.value,
            options: const [
              StatusOption(value: 'Mauvais', label: 'Mauvais', icon: Icons.circle, color: kCrmDanger),
              StatusOption(value: 'Moyen', label: 'Moyen', icon: Icons.circle, color: kCrmWarning),
              StatusOption(value: 'Bien', label: 'Bien', icon: Icons.circle, color: kCrmSuccess),
            ],
            onSelect: (v) {
              c.niveauBainEau.value = v;
              onChanged();
            },
          )),
      // `outOfRange` dérive de `c.temperatureEau.text` à chaque frappe —
      // recalculé ici via `AnimatedBuilder` scoped à cette seule carte (un
      // `ParameterCard`/`NumericCard` ne s'auto-rebuild jamais : il
      // affiche les props qu'on lui donne au moment du build).
      AnimatedBuilder(
        animation: c.temperatureEau,
        builder: (context, _) => NumericCard(
          icon: cqMachineFieldIcon(CqMachineField.temperatureEau),
          title: "Température d'eau",
          controller: c.temperatureEau,
          suffix: '°C',
          outOfRange: c.controleMachineTemperatureEauOutOfRange,
          rangeHint:
              '${AppLocalizations.of(context).translate('Plage attendue :')} ${PorPromeshController.machineTemperatureEauMin.toStringAsFixed(0)}–${PorPromeshController.machineTemperatureEauMax.toStringAsFixed(0)}°C',
          onChanged: onChanged,
        ),
      ),
      NumericCard(
        icon: cqMachineFieldIcon(CqMachineField.temperaturePistons),
        title: 'Température des Pistons (°C)',
        hintText: 'Saisir la température des pistons',
        controller: c.temperaturePistons,
        suffix: '°C',
        onChanged: onChanged,
      ),
      Obx(() => ParameterCard(
            icon: cqMachineFieldIcon(CqMachineField.etatPistons),
            title: 'État des pistons',
            value: c.etatPistons.value,
            options: const [
              StatusOption(value: 'Propre', label: 'Propre', icon: Icons.check_circle_rounded, color: kCrmSuccess),
              StatusOption(value: 'Sale', label: 'Sale', icon: Icons.cancel_rounded, color: kCrmDanger),
            ],
            onSelect: (v) {
              c.etatPistons.value = v;
              onChanged();
            },
          )),
      Obx(() => ParameterCard(
            icon: cqMachineFieldIcon(CqMachineField.fluideVisuel),
            title: "Fuite d'eau visuelle",
            value: c.fluideVisuel.value,
            options: const [
              StatusOption(value: 'Absence', label: 'Absence', icon: Icons.check_circle_rounded, color: kCrmSuccess),
              StatusOption(value: 'Présence', label: 'Présence', icon: Icons.cancel_rounded, color: kCrmDanger),
            ],
            onSelect: (v) {
              c.fluideVisuel.value = v;
              onChanged();
            },
          )),
      Obx(() => ParameterCard(
            icon: cqMachineFieldIcon(CqMachineField.etatDisqueCoupe),
            title: 'État disque de coupe (Machine)',
            value: c.etatDisqueCoupe.value,
            options: const [
              StatusOption(value: 'OK', label: 'OK', icon: Icons.check_circle_rounded, color: kCrmSuccess),
              StatusOption(value: 'NOK', label: 'NOK', icon: Icons.cancel_rounded, color: kCrmDanger),
            ],
            onSelect: (v) {
              c.etatDisqueCoupe.value = v;
              onChanged();
            },
          )),
    ]);
  }
}
