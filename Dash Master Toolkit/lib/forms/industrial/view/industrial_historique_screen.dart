// lib/forms/industrial/view/industrial_historique_screen.dart
//
// Historique générique PROBAR / MÉLANGE / MAINTENANCE — liste de cartes
// (jamais de DataTable), réutilisé par les 3 modules via [module]/[color].

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'package:intl/intl.dart';

import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';
import 'package:dash_master_toolkit/models/maintenance_request_model.dart';
import 'package:dash_master_toolkit/services/maintenance_request_service.dart';
import '../theme/industrial_theme.dart';
import '../model/industrial_record_model.dart';
import '../service/industrial_record_service.dart';

// Adapte une MaintenanceRequest (nouveau backend maintenance_requests) vers
// IndustrialRecordModel pour réutiliser _RecordCard sans dupliquer l'UI.
IndustrialRecordModel _toIndustrialRecordModel(MaintenanceRequest r) {
  return IndustrialRecordModel(
    id: r.id,
    module: 'maintenance',
    machine: r.equipement,
    dateFiche: DateFormat('yyyy-MM-dd').format(r.createdAt),
    typePanne: r.typePanne,
    urgence: r.urgence,
    description: r.description,
    statut: r.statut,
    createdAt: r.createdAt.toIso8601String(),
  );
}

class IndustrialHistoriqueScreen extends StatefulWidget {
  final String module; // 'probar' | 'melange' | 'maintenance'
  final String title;
  final Color color;
  final String newFicheRoute;
  final String newFicheLabel;

  const IndustrialHistoriqueScreen({
    super.key,
    required this.module,
    required this.title,
    required this.color,
    required this.newFicheRoute,
    required this.newFicheLabel,
  });

  @override
  State<IndustrialHistoriqueScreen> createState() => _IndustrialHistoriqueScreenState();
}

class _IndustrialHistoriqueScreenState extends State<IndustrialHistoriqueScreen> {
  bool _loading = true;
  String? _error;
  List<IndustrialRecordModel> _items = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({bool forceRefresh = false}) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      // "maintenance" lit désormais maintenance_requests (même API/table que
      // ADMINISTRATION > Demandes > Maintenance) — plus jamais
      // industrial_records, pour que les deux écrans affichent toujours
      // exactement les mêmes fiches. Les autres modules (probar/mélange)
      // restent sur industrial_records, inchangé.
      final items = widget.module == 'maintenance'
          ? (await MaintenanceRequestService.instance.fetchAll()).map(_toIndustrialRecordModel).toList()
          : await IndustrialRecordService.instance.fetchAll(module: widget.module, forceRefresh: forceRefresh);
      if (!mounted) return;
      setState(() => _items = items);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kCrmBg,
      body: SafeArea(
        child: IndustrialPageBody(
          child: RefreshIndicator(
            onRefresh: () => _load(forceRefresh: true),
            child: ListView(
              padding: const EdgeInsets.all(20),
              children: [
                Row(children: [
                  Expanded(
                    child: Text(
                        '${AppLocalizations.of(context).translate('Historique')} ${AppLocalizations.of(context).translate(widget.title)}',
                        style: tInter(fontSize: 22, fontWeight: FontWeight.w900, color: kCrmText)),
                  ),
                  IndustrialBigButton(
                    label: AppLocalizations.of(context).translate(widget.newFicheLabel),
                    icon: Icons.add_rounded,
                    color: widget.color,
                    onTap: () => context.go(widget.newFicheRoute),
                  ),
                ]),
                const SizedBox(height: 20),
                if (_loading)
                  const Padding(padding: EdgeInsets.only(top: 60), child: Center(child: CircularProgressIndicator()))
                else if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 40),
                    child: Center(
                        child: Text(
                            '${AppLocalizations.of(context).translate('Erreur')} : $_error',
                            style: tInter(color: kCrmDanger))),
                  )
                else if (_items.isEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 60),
                    child: Center(
                      child: Column(children: [
                        Icon(Icons.inbox_outlined, size: 48, color: kCrmTextSub.withOpacity(0.5)),
                        const SizedBox(height: 12),
                        Text(AppLocalizations.of(context).translate('Aucune fiche pour le moment'),
                            style: tInter(fontSize: 14, color: kCrmTextSub)),
                      ]),
                    ),
                  )
                else
                  ..._items.map((m) => _RecordCard(model: m, color: widget.color)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _RecordCard extends StatelessWidget {
  final IndustrialRecordModel model;
  final Color color;

  const _RecordCard({required this.model, required this.color});

  @override
  Widget build(BuildContext context) {
    final isMaintenance = model.module == 'maintenance';
    final qualiteOk = model.statutQualite == 'ok';

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: kCrmSurface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: kCrmBorder),
      ),
      child: Row(children: [
        Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(12)),
          child: Icon(isMaintenance ? Icons.build_outlined : Icons.fact_check_outlined, color: color),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(
              model.dateFiche ?? '—',
              style: tInter(fontSize: 14, fontWeight: FontWeight.w800, color: kCrmText),
            ),
            const SizedBox(height: 2),
            Text(
              isMaintenance
                  ? '${model.machine ?? AppLocalizations.of(context).translate("Équipement non précisé")} · ${model.typePanne ?? AppLocalizations.of(context).translate("Panne")}'
                  : [
                      if (model.machine != null)
                        '${AppLocalizations.of(context).translate("Machine")} ${model.machine}',
                      if (model.poste != null)
                        AppLocalizations.of(context)
                            .translate(model.poste == 'matin' ? 'Poste Matin' : 'Poste Nuit'),
                      if (model.operateur != null && model.operateur!.isNotEmpty) model.operateur!,
                    ].join(' · '),
              style: tInter(fontSize: 12.5, color: kCrmTextSub),
            ),
          ]),
        ),
        if (isMaintenance)
          _StatusPill(label: _urgenceLabel(model.urgence), color: _urgenceColor(model.urgence))
        else if (model.statutQualite != null)
          _StatusPill(label: qualiteOk ? 'OK' : 'NOK', color: qualiteOk ? kCrmSuccess : kCrmDanger),
      ]),
    );
  }

  String _urgenceLabel(String? u) {
    switch (u) {
      case 'critique':
        return 'Critique';
      case 'moyenne':
        return 'Moyenne';
      case 'faible':
        return 'Faible';
      default:
        return model.statut;
    }
  }

  Color _urgenceColor(String? u) {
    switch (u) {
      case 'critique':
        return kCrmDanger;
      case 'moyenne':
        return kCrmWarning;
      default:
        return kCrmSuccess;
    }
  }
}

class _StatusPill extends StatelessWidget {
  final String label;
  final Color color;
  const _StatusPill({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(20)),
      child: Text(AppLocalizations.of(context).translate(label),
          style: tInter(fontSize: 11.5, fontWeight: FontWeight.w800, color: color)),
    );
  }
}
