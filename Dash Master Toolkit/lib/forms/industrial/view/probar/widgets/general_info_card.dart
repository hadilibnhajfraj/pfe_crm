// lib/forms/industrial/view/probar/widgets/general_info_card.dart
//
// Card "Informations Générales" de l'écran Détail PROBAR — même composant
// (CqCardSurface + tuiles icône/label/valeur) que PorPromeshDetailScreen.
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';
import 'package:dash_master_toolkit/forms/por_promesh/utils/por_promesh_safe_value.dart';
import 'package:dash_master_toolkit/forms/por_promesh/view/modules/controle_qualite/cq_theme.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

import '../../../model/industrial_record_model.dart';

class GeneralInfoCard extends StatelessWidget {
  final IndustrialRecordModel record;
  final String? heureDebut;
  final String? heureFin;

  const GeneralInfoCard({super.key, required this.record, this.heureDebut, this.heureFin});

  @override
  Widget build(BuildContext context) {
    final qualite = _qualiteInfo(context, record.statutQualite);
    final observations = safeValue(record.observations);
    return CqCardSurface(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Wrap(spacing: 16, runSpacing: 14, children: [
          _tile(context, Icons.event_outlined, 'Date', safeValue(record.dateFiche)),
          _tile(context, Icons.precision_manufacturing_outlined, 'Machine',
              record.machine == null ? '' : AppLocalizations.of(context).translate('Machine ${record.machine}')),
          _tile(
            context,
            record.poste == 'matin' ? Icons.wb_sunny_rounded : Icons.nightlight_round,
            'Poste',
            record.poste == 'matin'
                ? AppLocalizations.of(context).translate('Matin')
                : (record.poste == 'nuit' ? AppLocalizations.of(context).translate('Nuit') : safeValue(record.poste)),
          ),
          _tile(context, Icons.person_outline_rounded, 'Opérateur', safeValue(record.operateur)),
          _tile(context, Icons.schedule_outlined, 'Heure Début', safeValue(heureDebut)),
          _tile(context, Icons.update_rounded, 'Heure Fin', safeValue(heureFin)),
          _tile(context, Icons.speed_rounded, 'Quantité Produite',
              record.quantiteProduite == null ? '' : '${_fmtNum(record.quantiteProduite)} m²'),
          _tile(context, Icons.flag_outlined, 'Statut Qualité', qualite.label, valueColor: qualite.color),
          _tile(context, Icons.calendar_today_outlined, 'Créée le', _fmtDateTime(record.createdAt)),
          _tile(context, Icons.edit_calendar_outlined, 'Dernière modification', _fmtDateTime(record.updatedAt)),
        ]),
        if (observations.isNotEmpty) ...[
          const SizedBox(height: 14),
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              width: 28,
              height: 28,
              alignment: Alignment.center,
              decoration:
                  BoxDecoration(color: kMaintenanceColor.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
              child: const Icon(Icons.notes_rounded, size: 14, color: kMaintenanceColor),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(AppLocalizations.of(context).translate('Observations'), style: tInter(fontSize: 10, color: kCrmTextSub)),
                const SizedBox(height: 2),
                Text(observations, style: tInter(fontSize: 12.5, fontWeight: FontWeight.w700, color: kCrmText)),
              ]),
            ),
          ]),
        ],
      ]),
    );
  }

  Widget _tile(BuildContext context, IconData icon, String label, String value, {Color? valueColor}) {
    return SizedBox(
      width: 210,
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          width: 28,
          height: 28,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: kMaintenanceColor.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
          child: Icon(icon, size: 14, color: kMaintenanceColor),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(AppLocalizations.of(context).translate(label), style: tInter(fontSize: 10, color: kCrmTextSub)),
            const SizedBox(height: 2),
            Text(value.isEmpty ? '—' : value,
                style: tInter(fontSize: 12.5, fontWeight: FontWeight.w700, color: valueColor ?? kCrmText),
                overflow: TextOverflow.ellipsis),
          ]),
        ),
      ]),
    );
  }

  ({Color color, String label}) _qualiteInfo(BuildContext context, String? statutQualite) {
    if (statutQualite == 'ok') return (color: kCrmSuccess, label: AppLocalizations.of(context).translate('Conforme'));
    if (statutQualite == 'nok') return (color: kCrmDanger, label: AppLocalizations.of(context).translate('Non Conforme'));
    return (color: kCrmTextSub, label: AppLocalizations.of(context).translate('Non renseigné'));
  }

  String _fmtNum(num? v) {
    if (v == null || v.isNaN) return '';
    if (v == v.roundToDouble()) return v.toInt().toString();
    return v.toStringAsFixed(2);
  }

  String _fmtDateTime(String? iso) {
    if (iso == null || iso.isEmpty) return '';
    final d = DateTime.tryParse(iso);
    if (d == null) return safeValue(iso);
    return DateFormat('dd/MM/yyyy HH:mm').format(d);
  }
}
