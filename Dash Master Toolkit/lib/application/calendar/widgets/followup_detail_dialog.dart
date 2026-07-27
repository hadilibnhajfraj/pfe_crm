import 'package:flutter/material.dart';
import 'package:dash_master_toolkit/application/calendar/model/relance_calendar_item.dart';
import 'package:dash_master_toolkit/services/relance_api.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

const _kPrimary = Color(0xFF4F46E5);

Color _statutColor(String statut) {
  switch (statut) {
    case "faite":
      return const Color(0xFF22C55E);
    case "annulee":
      return const Color(0xFF94A3B8);
    default:
      return const Color(0xFF3B82F6);
  }
}

String _statutLabel(BuildContext context, String statut) {
  final lang = AppLocalizations.of(context);
  switch (statut) {
    case "faite":
      return lang.translate("Terminé");
    case "annulee":
      return lang.translate("Annulé");
    default:
      return lang.translate("Planifié");
  }
}

/// Ouvre le dialog de détail d'un Follow-up (clic sur un événement du
/// calendrier CRM) avec les actions Modifier / Marquer terminé / Reporter /
/// Annuler. L'appelant est responsable de rafraîchir le calendrier après
/// fermeture (le dialog ne connaît pas le controller de l'écran).
Future<void> showFollowupDetailDialog(BuildContext context, RelanceCalendarItem relance) async {
  await showDialog<void>(
    context: context,
    builder: (dialogContext) => _FollowupDetailDialog(relance: relance),
  );
}

class _FollowupDetailDialog extends StatefulWidget {
  final RelanceCalendarItem relance;
  const _FollowupDetailDialog({required this.relance});

  @override
  State<_FollowupDetailDialog> createState() => _FollowupDetailDialogState();
}

class _FollowupDetailDialogState extends State<_FollowupDetailDialog> {
  late final RelanceCalendarItem _relance = widget.relance;
  bool _busy = false;

  bool get _isPlanifiee => _relance.statutRelance == "planifiee";

  Future<void> _apply(Map<String, dynamic> payload, {String? successMessage}) async {
    setState(() => _busy = true);
    try {
      await RelanceApi.instance.updateRelance(
        contactId: _relance.commercialContactId,
        relanceId: _relance.id,
        payload: payload,
      );
      if (!mounted) return;
      Navigator.of(context).pop();
      if (successMessage != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(successMessage), backgroundColor: Colors.green.shade700),
        );
      }
    } catch (e) {
      setState(() => _busy = false);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("${AppLocalizations.of(context).translate('Erreur')} : $e"), backgroundColor: Colors.red.shade700),
      );
    }
  }

  Future<void> _confirmAndApply({
    required String title,
    required String message,
    required Map<String, dynamic> payload,
    required String successMessage,
  }) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: Text(AppLocalizations.of(ctx).translate("Annuler"))),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: _kPrimary, foregroundColor: Colors.white),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(AppLocalizations.of(ctx).translate("Confirmer")),
          ),
        ],
      ),
    );
    if (confirmed == true) await _apply(payload, successMessage: successMessage);
  }

  Future<void> _openEditDialog({required bool dateOnly}) async {
    final dateCtrl = TextEditingController(text: _relance.dateRelance);
    final heureCtrl = TextEditingController(text: _relance.heureRelance ?? "");
    final commentaireCtrl = TextEditingController(text: _relance.commentaire ?? "");

    Future<void> pickDate(BuildContext ctx) async {
      final picked = await showDatePicker(
        context: ctx,
        initialDate: DateTime.tryParse(_relance.dateRelance) ?? DateTime.now(),
        firstDate: DateTime(2020),
        lastDate: DateTime(2100),
      );
      if (picked != null) {
        dateCtrl.text =
            "${picked.year}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}";
      }
    }

    Future<void> pickTime(BuildContext ctx) async {
      final picked = await showTimePicker(context: ctx, initialTime: TimeOfDay.now());
      if (picked != null) {
        heureCtrl.text = "${picked.hour.toString().padLeft(2, '0')}:${picked.minute.toString().padLeft(2, '0')}";
      }
    }

    final saved = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
          title: Text(AppLocalizations.of(context)
              .translate(dateOnly ? "Reporter le Follow-up" : "Modifier le Follow-up")),
          content: SizedBox(
            width: 420,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: dateCtrl,
                  readOnly: true,
                  decoration: InputDecoration(labelText: AppLocalizations.of(context).translate("Date"), border: const OutlineInputBorder()),
                  onTap: () => pickDate(dialogContext),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: heureCtrl,
                  readOnly: true,
                  decoration: InputDecoration(labelText: AppLocalizations.of(context).translate("Heure"), border: const OutlineInputBorder()),
                  onTap: () => pickTime(dialogContext),
                ),
                if (!dateOnly) ...[
                  const SizedBox(height: 12),
                  TextField(
                    controller: commentaireCtrl,
                    maxLines: 3,
                    decoration: InputDecoration(labelText: AppLocalizations.of(context).translate("Commentaire"), border: const OutlineInputBorder()),
                  ),
                ],
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(dialogContext).pop(false), child: Text(AppLocalizations.of(context).translate("Annuler"))),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: _kPrimary, foregroundColor: Colors.white),
              onPressed: () => Navigator.of(dialogContext).pop(true),
              child: Text(AppLocalizations.of(context).translate("Enregistrer")),
            ),
          ],
        ),
      ),
    );

    if (saved == true) {
      await _apply({
        "dateRelance": dateCtrl.text.trim(),
        "heureRelance": heureCtrl.text.trim().isEmpty ? null : heureCtrl.text.trim(),
        if (!dateOnly)
          "commentaire": commentaireCtrl.text.trim().isEmpty ? null : commentaireCtrl.text.trim(),
        "statutRelance": "planifiee",
        // Le commercial ne change pas depuis ce dialog rapide, mais le
        // backend l'exige dès que date+heure sont envoyés pour l'acteur
        // d'automatisation (info@) — on renvoie donc la valeur déjà en base.
        if (_relance.commercialId != null) "commercialId": _relance.commercialId,
      }, successMessage: AppLocalizations.of(context)
          .translate(dateOnly ? "Follow-up reporté" : "Follow-up modifié"));
    }
  }

  @override
  Widget build(BuildContext context) {
    final contact = _relance.contact;
    final statutColor = _statutColor(_relance.statutRelance);

    return AlertDialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      title: Row(
        children: [
          Expanded(child: Text(contact?.fullName ?? AppLocalizations.of(context).translate("Follow-up"))),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: statutColor.withOpacity(0.12),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: statutColor.withOpacity(0.4)),
            ),
            child: Text(
              _statutLabel(context, _relance.statutRelance),
              style: TextStyle(color: statutColor, fontWeight: FontWeight.w700, fontSize: 12),
            ),
          ),
        ],
      ),
      content: SizedBox(
        width: 460,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if ((contact?.nomSociete ?? "").isNotEmpty) _row(Icons.business_rounded, "Société", contact!.nomSociete!),
              _row(Icons.calendar_today_rounded, "Date", _relance.dateRelance),
              if ((_relance.heureRelance ?? "").isNotEmpty) _row(Icons.schedule_rounded, "Heure", _relance.heureRelance!),
              if ((_relance.projectName ?? "").isNotEmpty) _row(Icons.work_outline_rounded, "Projet", _relance.projectName!),
              if ((_relance.commercialName ?? "").isNotEmpty) _row(Icons.badge_outlined, "Commercial", _relance.commercialName!),
              if ((contact?.telephone ?? "").isNotEmpty) _row(Icons.phone_outlined, "Téléphone", contact!.telephone!),
              if ((contact?.email ?? "").isNotEmpty) _row(Icons.email_outlined, "Email", contact!.email!),
              if ((_relance.commentaire ?? "").isNotEmpty) _row(Icons.comment_outlined, "Commentaire", _relance.commentaire!),
            ],
          ),
        ),
      ),
      actionsAlignment: MainAxisAlignment.spaceBetween,
      actions: [
        TextButton(
          onPressed: _busy ? null : () => Navigator.of(context).pop(),
          child: Text(AppLocalizations.of(context).translate("Fermer")),
        ),
        if (_busy)
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 12),
            child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)),
          )
        else
          Wrap(
            spacing: 6,
            children: [
              if (_isPlanifiee) ...[
                _actionBtn("Modifier", Icons.edit_outlined, _kPrimary, () => _openEditDialog(dateOnly: false)),
                _actionBtn("Reporter", Icons.event_repeat_rounded, const Color(0xFFF59E0B),
                    () => _openEditDialog(dateOnly: true)),
                _actionBtn(
                  "Marquer terminé",
                  Icons.check_circle_outline_rounded,
                  const Color(0xFF22C55E),
                  () => _confirmAndApply(
                    title: AppLocalizations.of(context).translate("Marquer terminé"),
                    message: AppLocalizations.of(context).translate("Confirmer que ce Follow-up est terminé ?"),
                    payload: {"statutRelance": "faite"},
                    successMessage: AppLocalizations.of(context).translate("Follow-up marqué terminé"),
                  ),
                ),
                _actionBtn(
                  "Annuler",
                  Icons.cancel_outlined,
                  const Color(0xFFEF4444),
                  () => _confirmAndApply(
                    title: AppLocalizations.of(context).translate("Annuler le Follow-up"),
                    message: AppLocalizations.of(context).translate("Confirmer l'annulation de ce Follow-up ?"),
                    payload: {"statutRelance": "annulee"},
                    successMessage: AppLocalizations.of(context).translate("Follow-up annulé"),
                  ),
                ),
              ],
            ],
          ),
      ],
    );
  }

  Widget _row(IconData icon, String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 5),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 16, color: Colors.grey.shade600),
            const SizedBox(width: 8),
            SizedBox(
              width: 90,
              child: Text(AppLocalizations.of(context).translate(label), style: TextStyle(fontSize: 12, color: Colors.grey.shade600, fontWeight: FontWeight.w600)),
            ),
            Expanded(child: Text(value, style: const TextStyle(fontSize: 13))),
          ],
        ),
      );

  Widget _actionBtn(String label, IconData icon, Color color, VoidCallback onTap) => OutlinedButton.icon(
        onPressed: onTap,
        icon: Icon(icon, size: 16, color: color),
        label: Text(AppLocalizations.of(context).translate(label), style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600)),
        style: OutlinedButton.styleFrom(
          side: BorderSide(color: color.withOpacity(0.4)),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        ),
      );
}
