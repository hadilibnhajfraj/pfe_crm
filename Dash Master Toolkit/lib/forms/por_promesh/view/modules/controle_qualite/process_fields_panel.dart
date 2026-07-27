// lib/forms/por_promesh/view/modules/controle_qualite/process_fields_panel.dart
//
// "Contrôle Process" — champs éditables (widgets réels : TextField pour les
// paramètres numériques, StatusSelector pour les choix Conforme/Non
// Conforme, OK/NOK, Oui/Non), affichés directement sous Contrôle Machine.
// Remplace l'ancien affichage en lecture seule (`ProcessControlReadOnlyCard`)
// qui ne montrait que les 4 paramètres dérivés automatiquement — ici
// l'utilisateur peut saisir les 13 autres paramètres qui n'ont AUCUNE
// source de donnée côté Contrôle Machine (voir `porPromesh.service.js`,
// `DERIVED_PROCESS_PARAMS`).
//
// Une seule saisie par paramètre (bloc `controle_08h20`, aucun créneau
// horaire affiché, aucun P2, aucune case COR manuelle) — écrit directement
// dans `c.processControlBlocs`, déjà entièrement sérialisé et envoyé au
// backend par `PorPromeshController._buildProcessControlRows()` : aucune
// nouvelle logique de sauvegarde nécessaire. COR est calculé automatiquement
// depuis la valeur saisie (`cqComputeCorP1`), jamais coché à la main.
//
// 'Niveau bain de résine' est volontairement exclu (hors périmètre demandé).
//
// Rappel important : sur les 13 champs ci-dessous, 4 ("Température eau",
// "Pression air comprimé", "Fuite d'eau", "Etat disque de coupe")
// correspondent à des champs déjà saisis dans Contrôle Machine — le backend
// écrase silencieusement leur valeur ici par la valeur dérivée du champ
// Contrôle Machine correspondant à chaque `saveDraft()` (`applyDerivedProcessControl`).
// Elles restent éditables pour rester visuellement homogènes avec les 9
// autres champs, mais la valeur affichée après enregistrement reflète
// toujours Contrôle Machine, jamais une saisie manuelle divergente ici.

import 'package:flutter/material.dart';

import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/por_promesh/controller/por_promesh_controller.dart';

import 'cq_theme.dart';
import 'machine_control_grid.dart';
import 'parameter_card.dart';
import 'numeric_card.dart';
import 'status_selector.dart';

const String kProcessFieldsBloc = 'controle_08h20';

const List<String> processFieldsExcluded = ['Niveau bain de résine'];

class ProcessFieldsPanel extends StatelessWidget {
  final PorPromeshController c;
  final VoidCallback onChanged;

  const ProcessFieldsPanel({super.key, required this.c, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final rows = c.processControlBlocs[kProcessFieldsBloc]!;
    return MachineControlGrid(cards: [
      for (final cfg in processParamConfigs)
        if (!processFieldsExcluded.contains(cfg.parametre))
          _fieldCard(cfg, rows.firstWhere((r) => r.parametre == cfg.parametre)),
    ]);
  }

  Widget _fieldCard(ProcessParamConfig cfg, ProcessControlRow row) {
    if (cfg.kind == ProcessParamKind.numeric) {
      return NumericCard(
        icon: cqProcessParamIcon(cfg.parametre),
        title: cfg.title,
        controller: row.p1,
        suffix: cfg.suffix,
        onChanged: onChanged,
      );
    }
    final options = _optionsFor(cfg.kind);
    return AnimatedBuilder(
      animation: row.p1,
      builder: (context, _) => ParameterCard(
        icon: cqProcessParamIcon(cfg.parametre),
        title: cfg.title,
        value: row.p1.text.isEmpty ? null : row.p1.text,
        options: options,
        onSelect: (v) {
          row.p1.text = v;
          row.corP1.value = cqComputeCorP1(cfg.kind, v);
          onChanged();
        },
      ),
    );
  }

  List<StatusOption> _optionsFor(ProcessParamKind kind) => switch (kind) {
        ProcessParamKind.choiceConforme => const [
            StatusOption(value: 'Conforme', label: 'Conforme', icon: Icons.check_circle_rounded, color: kCrmSuccess),
            StatusOption(value: 'Non Conforme', label: 'Non Conforme', icon: Icons.cancel_rounded, color: kCrmDanger),
          ],
        ProcessParamKind.choiceOkNok => const [
            StatusOption(value: 'OK', label: 'OK', icon: Icons.check_circle_rounded, color: kCrmSuccess),
            StatusOption(value: 'NOK', label: 'NOK', icon: Icons.cancel_rounded, color: kCrmDanger),
          ],
        ProcessParamKind.choiceFuite => const [
            StatusOption(value: 'Non', label: 'Non', icon: Icons.check_circle_rounded, color: kCrmSuccess),
            StatusOption(value: 'Oui', label: 'Oui', icon: Icons.cancel_rounded, color: kCrmDanger),
          ],
        _ => const [],
      };
}
