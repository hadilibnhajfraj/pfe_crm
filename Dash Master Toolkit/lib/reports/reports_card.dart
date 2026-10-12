import 'package:flutter/material.dart';

import 'package:dash_master_toolkit/forms/production/view/widgets/production_widgets.dart';

import 'report_service.dart';

/// « Mes rapports » : rapports PDF / Excel que le serveur autorise pour le
/// profil connecté (GET /reports). Les fichiers sont générés par le serveur,
/// avec le même périmètre de données que les écrans du CRM.
class ReportsCard extends StatefulWidget {
  const ReportsCard({super.key, this.dataSource, this.period});

  final ReportsDataSource? dataSource;

  /// Période choisie sur le tableau de bord, transmise aux rapports qui l'acceptent.
  final String? period;

  @override
  State<ReportsCard> createState() => _ReportsCardState();
}

class _ReportsCardState extends State<ReportsCard> {
  late final ReportsDataSource _source = widget.dataSource ?? ReportService();

  List<ReportItem>? _reports;
  bool _failed = false;
  String? _busy; // « type:format » en cours de génération
  String? _message;
  bool _messageIsError = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final reports = await _source.fetchCatalog();
      if (!mounted) return;
      setState(() {
        _reports = reports;
        _failed = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _failed = true);
    }
  }

  Future<void> _download(ReportItem report, String format) async {
    setState(() {
      _busy = '${report.type}:$format';
      _message = null;
    });
    try {
      await _source.download(report, format, period: widget.period);
      if (!mounted) return;
      setState(() {
        _message = '« ${report.title} » a été généré.';
        _messageIsError = false;
      });
    } on UnsupportedError catch (e) {
      if (!mounted) return;
      setState(() {
        _message = e.message ?? 'Téléchargement indisponible sur cet appareil.';
        _messageIsError = true;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _message = 'Le rapport « ${report.title} » n\'a pas pu être généré. Réessayez dans un instant.';
        _messageIsError = true;
      });
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final reports = _reports;
    if (_failed) {
      return const Padding(
        padding: EdgeInsets.only(bottom: 16),
        child: Text('La liste des rapports est momentanément indisponible.', key: Key('reports-unavailable')),
      );
    }
    if (reports == null || reports.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const ProdSectionTitle(title: 'Mes rapports', subtitle: 'Fichiers générés par le serveur, limités à vos données'),
        const SizedBox(height: 10),
        ProdCard(
          key: const Key('reports-card'),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (final report in reports)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Wrap(
                    spacing: 10,
                    runSpacing: 8,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      SizedBox(width: 300, child: Text(report.title, style: const TextStyle(fontWeight: FontWeight.w600))),
                      if (report.formats.contains('xlsx'))
                        ProdButton(
                          key: Key('report-${report.type}-xlsx'),
                          label: 'Excel',
                          icon: Icons.grid_on_rounded,
                          busy: _busy == '${report.type}:xlsx',
                          onTap: _busy == null ? () => _download(report, 'xlsx') : null,
                        ),
                      if (report.formats.contains('pdf'))
                        ProdButton(
                          key: Key('report-${report.type}-pdf'),
                          label: 'PDF',
                          icon: Icons.picture_as_pdf_outlined,
                          busy: _busy == '${report.type}:pdf',
                          onTap: _busy == null ? () => _download(report, 'pdf') : null,
                        ),
                    ],
                  ),
                ),
              if (_message != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    _message!,
                    key: const Key('reports-message'),
                    style: TextStyle(color: _messageIsError ? const Color(0xFFDC2626) : const Color(0xFF16A34A)),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 20),
      ],
    );
  }
}
