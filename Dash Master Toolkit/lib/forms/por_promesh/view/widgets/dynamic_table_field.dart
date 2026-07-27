// lib/forms/por_promesh/view/widgets/dynamic_table_field.dart
//
// Generic dynamic-row table editor, reused for the 3 tables of the
// POR PROMESH form (Contrôles Qualité, Arrêts Machine, Contrôle Qualité
// final). Rows are plain Map<String, dynamic> held in a GetX RxList —
// edits write straight into the map (no rebuild needed for text fields,
// since each cell owns its own TextEditingController).

import 'package:flutter/material.dart';
import 'package:get/get.dart';

import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/view/widgets/crm_widgets.dart';
import 'package:dash_master_toolkit/widgets/common_app_widget.dart';
import 'package:dash_master_toolkit/utils/common.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

enum DynamicColumnType { text, number, time, dropdown }

class DynamicTableColumn {
  final String key;
  final String label;
  final DynamicColumnType type;
  final List<String>? options; // dropdown only
  final double width;

  const DynamicTableColumn({
    required this.key,
    required this.label,
    this.type = DynamicColumnType.text,
    this.options,
    this.width = 160,
  });
}

class DynamicTableField extends StatefulWidget {
  final String title;
  final IconData icon;
  final List<DynamicTableColumn> columns;
  final RxList<Map<String, dynamic>> rows;
  final Map<String, dynamic> Function() emptyRow;

  const DynamicTableField({
    super.key,
    required this.title,
    required this.icon,
    required this.columns,
    required this.rows,
    required this.emptyRow,
  });

  @override
  State<DynamicTableField> createState() => _DynamicTableFieldState();
}

class _DynamicTableFieldState extends State<DynamicTableField> {
  final Map<String, TextEditingController> _controllers = {};

  TextEditingController _ctrlFor(int index, String key, String initialText) {
    final k = '$index|$key';
    return _controllers.putIfAbsent(k, () => TextEditingController(text: initialText));
  }

  void _clearControllers() {
    for (final c in _controllers.values) {
      c.dispose();
    }
    _controllers.clear();
  }

  void _addRow() {
    widget.rows.add(widget.emptyRow());
  }

  void _removeRow(int index) {
    widget.rows.removeAt(index);
    _clearControllers();
  }

  @override
  void dispose() {
    _clearControllers();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      CrmSectionTitle(title: widget.title, icon: widget.icon),
      const SizedBox(height: 12),
      Obx(() {
        final rows = widget.rows;
        if (rows.isEmpty) {
          return Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: kCrmBg,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: kCrmBorder),
            ),
            child: Text(
                AppLocalizations.of(context)
                    .translate('Aucune ligne — cliquez sur "Ajouter une ligne"'),
                style: tInter(fontSize: 12, color: kCrmTextSub)),
          );
        }
        return Column(
          children: List.generate(rows.length, (index) {
            final row = rows[index];
            return Container(
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: kCrmSurface,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: kCrmBorder),
              ),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Expanded(
                  child: Wrap(
                    spacing: 10,
                    runSpacing: 8,
                    children: widget.columns
                        .map((col) => SizedBox(
                              width: col.width,
                              child: _buildCell(index, row, col),
                            ))
                        .toList(),
                  ),
                ),
                IconButton(
                  onPressed: () => _removeRow(index),
                  icon: const Icon(Icons.delete_outline_rounded, size: 18, color: kCrmDanger),
                  tooltip: AppLocalizations.of(context).translate('Supprimer la ligne'),
                ),
              ]),
            );
          }),
        );
      }),
      const SizedBox(height: 4),
      OutlinedButton.icon(
        onPressed: _addRow,
        icon: const Icon(Icons.add_rounded, size: 16),
        label: Text(AppLocalizations.of(context).translate('Ajouter une ligne'),
            style: tInter(fontSize: 13)),
        style: OutlinedButton.styleFrom(
          foregroundColor: kCrmPrimary,
          side: const BorderSide(color: kCrmPrimary),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        ),
      ),
      const SizedBox(height: 20),
    ]);
  }

  Widget _buildCell(int index, Map<String, dynamic> row, DynamicTableColumn col) {
    switch (col.type) {
      case DynamicColumnType.dropdown:
        return DropdownButtonFormField<String>(
          value: row[col.key] as String?,
          isExpanded: true,
          decoration: inputDecoration(context,
              hintText: AppLocalizations.of(context).translate(col.label)),
          items: (col.options ?? [])
              .map((o) => DropdownMenuItem(
                  value: o,
                  child: Text(AppLocalizations.of(context).translate(o),
                      style: tInter(fontSize: 13))))
              .toList(),
          onChanged: (v) => setState(() => row[col.key] = v),
        );

      case DynamicColumnType.time:
        final ctrl = _ctrlFor(index, col.key, (row[col.key] ?? '').toString());
        return TextFormField(
          controller: ctrl,
          readOnly: true,
          decoration: inputDecoration(context,
                  hintText: AppLocalizations.of(context).translate(col.label))
              .copyWith(
            suffixIcon: const Icon(Icons.access_time_rounded, size: 16, color: kCrmTextSub),
          ),
          validator: (v) => (v == null || v.trim().isEmpty)
              ? AppLocalizations.of(context).translate('Veuillez saisir une heure valide')
              : null,
          onTap: () async {
            final picked = await showTimePicker(context: context, initialTime: TimeOfDay.now());
            if (picked == null) return;
            final text = formatTime24h(picked);
            ctrl.text = text;
            row[col.key] = text;
            setState(() {});
          },
        );

      case DynamicColumnType.number:
        final ctrl = _ctrlFor(index, col.key, (row[col.key] ?? '').toString());
        return TextFormField(
          controller: ctrl,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: inputDecoration(context,
              hintText: AppLocalizations.of(context).translate(col.label)),
          onChanged: (v) => row[col.key] = v,
        );

      case DynamicColumnType.text:
        final ctrl = _ctrlFor(index, col.key, (row[col.key] ?? '').toString());
        return TextFormField(
          controller: ctrl,
          decoration: inputDecoration(context,
              hintText: AppLocalizations.of(context).translate(col.label)),
          onChanged: (v) => row[col.key] = v,
        );
    }
  }
}
