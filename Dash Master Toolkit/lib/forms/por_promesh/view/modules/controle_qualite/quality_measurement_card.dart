// lib/forms/por_promesh/view/modules/controle_qualite/quality_measurement_card.dart
//
// "Contrôle Qualité Produit" — tableau de mesures TOUTES LES 3 HEURES
// (Heure/Numéro de plaque/Maille/Longueur/Largeur/Conforme/Non conforme),
// INDÉPENDANT du Contrôle Process. 6 lignes par défaut
// (06:00/09:00/12:00/15:00/18:00/21:00) pré-remplies au bootstrap de la
// fiche (voir `PorPromeshController._seedDefaultQualiteRowsIfEmpty`) ;
// l'utilisateur peut en ajouter d'autres via "+ Ajouter une mesure".
// Chaque champ est obligatoire (bordure rouge tant qu'il est vide) — le
// statut est un champ unique nullable ('C'/'NC'), donc "Conforme" et "Non
// conforme" sont structurellement impossibles à sélectionner ensemble.
// "Hauteur" a été supprimée du tableau — les champs texte restants
// (Heure/N° Plaque/Maille/Long./Larg.) se répartissent désormais TOUTE la
// largeur disponible de la ligne (voir `_buildRow` — largeurs calculées via
// `LayoutBuilder`, plus de largeurs fixes), plutôt que de laisser un espace
// vide à droite.
//
// Chaque mesure est une ligne compacte (Wrap) plutôt qu'une carte empilée —
// plusieurs mesures restent visibles sans agrandir excessivement la page.

import 'package:flutter/material.dart';
import 'package:get/get.dart';

import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';

import 'cq_theme.dart';
import 'status_selector.dart';

class QualityMeasurementCard extends StatefulWidget {
  final RxList<Map<String, dynamic>> rows;
  const QualityMeasurementCard({super.key, required this.rows});

  @override
  State<QualityMeasurementCard> createState() => _QualityMeasurementCardState();
}

class _QualityMeasurementCardState extends State<QualityMeasurementCard> {
  final Map<String, TextEditingController> _controllers = {};

  TextEditingController _ctrlFor(int index, String key, Map<String, dynamic> row) {
    return _controllers.putIfAbsent(
      '$index|$key',
      () => TextEditingController(text: (row[key] ?? '').toString()),
    );
  }

  void _clearControllers() {
    for (final ctrl in _controllers.values) {
      ctrl.dispose();
    }
    _controllers.clear();
  }

  @override
  void dispose() {
    _clearControllers();
    super.dispose();
  }

  void _addRow() {
    setState(() => widget.rows.add({
          'heure': '',
          'numeroPlaque': '',
          'maille': '',
          'longueur': '',
          'largeur': '',
          'statutCOQ': null,
        }));
  }

  void _removeRow(int index) {
    setState(() {
      widget.rows.removeAt(index);
      // Les contrôleurs sont indexés par position — toute suppression
      // décale les index suivants, on les recrée donc tous au prochain
      // build (même approche que l'ancien DynamicTableField).
      _clearControllers();
    });
  }

  @override
  Widget build(BuildContext context) {
    return CqCardSurface(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const CqCardHeader(
          icon: Icons.straighten_rounded,
          title: 'Contrôle Qualité Produit',
          subtitle: 'Mesures toutes les 3 heures — heure, numéro de plaque, maille, longueur, largeur, statut',
          color: kMaintenanceColor,
        ),
        const SizedBox(height: 8),
        Obx(() {
          final rows = widget.rows;
          if (rows.isEmpty) {
            return Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: kCrmBg,
                borderRadius: BorderRadius.circular(kCqInnerRadius),
                border: Border.all(color: kCrmBorder),
              ),
              child: Text('Aucune mesure — cliquez sur "Ajouter une mesure"',
                  style: tInter(fontSize: 11.5, color: kCrmTextSub)),
            );
          }
          return Column(children: [for (var i = 0; i < rows.length; i++) _buildRow(i, rows[i])]);
        }),
        const SizedBox(height: 2),
        OutlinedButton.icon(
          onPressed: _addRow,
          icon: const Icon(Icons.add_rounded, size: 15),
          label: Text('Ajouter une mesure', style: tInter(fontSize: 11.5, fontWeight: FontWeight.w700)),
          style: OutlinedButton.styleFrom(
            foregroundColor: kMaintenanceColor,
            side: const BorderSide(color: kMaintenanceColor),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            minimumSize: Size.zero,
            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(kCqInnerRadius)),
          ),
        ),
      ]),
    );
  }

  static const double _kRowSpacing = 6;
  static const double _kIndexWidth = 22;
  static const double _kStatusWidth = 150;
  static const double _kDeleteWidth = 28;
  static const double _kMinFieldWidth = 76;

  // Poids relatif de chaque champ texte dans la répartition de la largeur
  // restante — Numéro de plaque un peu plus large (identifiants
  // alphanumériques plus longs qu'une mesure ou une heure).
  static const Map<String, double> _kFieldWeights = {
    'heure': 1,
    'numeroPlaque': 1.5,
    'maille': 1,
    'longueur': 1,
    'largeur': 1,
  };

  /// Ordre des colonnes : Heure, Numéro de plaque, Maille, Longueur,
  /// Largeur, Conforme/Non conforme. Les 5 champs texte se partagent TOUTE
  /// la largeur restante de la ligne (calculée via `LayoutBuilder`, pondérée
  /// par `_kFieldWeights`) une fois l'index, le sélecteur de statut et le
  /// bouton de suppression réservés — aucun espace vide à droite. Sur
  /// écran étroit, `Wrap` reprend le relais et replie proprement les champs
  /// (plancher `_kMinFieldWidth`), pas d'overflow horizontal.
  Widget _buildRow(int index, Map<String, dynamic> row) {
    final statut = row['statutCOQ'] as String?;
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(
        color: kCrmBg,
        borderRadius: BorderRadius.circular(kCqInnerRadius),
        border: Border.all(color: kCrmBorder),
      ),
      child: LayoutBuilder(builder: (context, constraints) {
        final fieldKeys = _kFieldWeights.keys.toList();
        final totalWeight = _kFieldWeights.values.fold<double>(0, (a, b) => a + b);
        final itemCount = 3 + fieldKeys.length; // index + champs texte + statut + suppression
        final reserved = _kIndexWidth + _kStatusWidth + _kDeleteWidth + _kRowSpacing * (itemCount - 1);
        final remaining = constraints.maxWidth - reserved;

        double widthFor(String key) {
          if (!remaining.isFinite || remaining <= 0) return _kMinFieldWidth;
          final w = remaining * (_kFieldWeights[key]! / totalWeight);
          return w < _kMinFieldWidth ? _kMinFieldWidth : w;
        }

        return Wrap(
          spacing: _kRowSpacing,
          runSpacing: _kRowSpacing,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            SizedBox(
              width: _kIndexWidth,
              child: Text('${index + 1}', style: tInter(fontSize: 11, fontWeight: FontWeight.w800, color: kCrmTextSub)),
            ),
            _measureField('Heure', _ctrlFor(index, 'heure', row),
                width: widthFor('heure'), numeric: false, hint: 'Heure', onChanged: (v) => setState(() => row['heure'] = v)),
            _measureField('N° Plaque', _ctrlFor(index, 'numeroPlaque', row),
                width: widthFor('numeroPlaque'),
                numeric: false,
                hint: 'Numéro de plaque',
                onChanged: (v) => setState(() => row['numeroPlaque'] = v)),
            _measureField('Maille', _ctrlFor(index, 'maille', row),
                width: widthFor('maille'), numeric: false, onChanged: (v) => setState(() => row['maille'] = v)),
            _measureField('Long.', _ctrlFor(index, 'longueur', row),
                width: widthFor('longueur'), numeric: true, onChanged: (v) => setState(() => row['longueur'] = v)),
            _measureField('Larg.', _ctrlFor(index, 'largeur', row),
                width: widthFor('largeur'), numeric: true, onChanged: (v) => setState(() => row['largeur'] = v)),
            SizedBox(
              width: _kStatusWidth,
              child: StatusSelector(
                selected: statut,
                options: const [
                  StatusOption(value: 'C', label: 'Conforme', icon: Icons.check_circle_rounded, color: kCrmSuccess),
                  StatusOption(value: 'NC', label: 'Non Conf.', icon: Icons.cancel_rounded, color: kCrmDanger),
                ],
                onSelect: (v) => setState(() => row['statutCOQ'] = v),
              ),
            ),
            SizedBox(
              width: _kDeleteWidth,
              height: 28,
              child: IconButton(
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(),
                tooltip: 'Supprimer la mesure',
                onPressed: () => _removeRow(index),
                icon: const Icon(Icons.delete_outline_rounded, size: 16, color: kCrmDanger),
              ),
            ),
          ],
        );
      }),
    );
  }

  /// Champ obligatoire — bordure rouge tant qu'il est vide (retour visuel
  /// immédiat, en plus du blocage réel de "Terminer la saisie" piloté par
  /// `PorPromeshController.controleProduitSaved`).
  Widget _measureField(
    String label,
    TextEditingController ctrl, {
    required double width,
    required bool numeric,
    required ValueChanged<String> onChanged,
    String? hint,
  }) {
    final missing = ctrl.text.trim().isEmpty;
    return SizedBox(
      width: width,
      child: TextField(
        controller: ctrl,
        keyboardType: numeric ? const TextInputType.numberWithOptions(decimal: true) : TextInputType.text,
        onChanged: onChanged,
        style: tInter(fontSize: 11.5, color: kCrmText),
        decoration: InputDecoration(
          labelText: label,
          labelStyle: tInter(fontSize: 10, color: kCrmTextSub),
          hintText: hint,
          hintStyle: tInter(fontSize: 10, color: kCrmTextSub),
          isDense: true,
          contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
          filled: true,
          fillColor: kCrmSurface,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: BorderSide(color: missing ? kCrmDanger.withOpacity(0.5) : kCrmBorder),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: BorderSide(color: missing ? kCrmDanger.withOpacity(0.5) : kCrmBorder),
          ),
        ),
      ),
    );
  }
}
