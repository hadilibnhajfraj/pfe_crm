// lib/forms/industrial/view/probar/probar_controle_qualite_screen.dart
//
// Contrôle Qualité PROBAR — une seule ligne affichée par machine (L1-L4,
// voir _lineIndexForMachine : Machine 1→L1, 2→L2, 3→L3, 4→L4). Les données
// des 4 lignes restent stockées dans c.controlesQualite (compat backend/
// fiches existantes), seule celle de la machine courante est visible/
// éditable ici.
//
// Architecture binding (v3) :
//   • _fieldCtrls : 28 TextEditingControllers stables (1 par slot × champ).
//   • _heureCtrls : 4 TextEditingControllers stables (1 par slot) pour le
//     champ "Heure", désormais éditable (sélecteur d'heure) au lieu du texte
//     fixe "07h30"/"11h00"/etc. affiché auparavant.
//   • onChanged de chaque TextField → _onFieldChanged() → mutation directe
//     de c.controlesQualite[i][key] en place → saveDraft() depuis n'importe où
//     (scaffold header ou bouton) reçoit toujours les données à jour.
//   • _validations : List<String?> locale pour chips OK/NOK → setState.
//   • _syncToController() : synchronise uniquement statutCOQ + print debug.
//   • Aucun Obx dans cet écran → aucun risque de rebuild pendant la saisie.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:go_router/go_router.dart';

import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';
import 'package:dash_master_toolkit/utils/common.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';
import '../../controller/probar_controller.dart';
import 'probar_module_scaffold.dart';

// ── Créneaux (une seule ligne affichée par machine — voir _lineIndexForMachine) ─
// Le 2e élément est désormais uniquement l'heure PAR DÉFAUT proposée pour les
// fiches sans valeur "heure" enregistrée (compat) — le champ est modifiable.
const _kSlots = [
  ('L1', '07:30', Color(0xFF7C3AED)),
  ('L2', '11:00', Color(0xFF16A34A)),
  ('L3', '14:00', Color(0xFFEA580C)),
  ('L4', '17:00', Color(0xFF2563EB)),
];

// Même mapping que probar_controle_machine_screen.dart (_lineIndexForMachine) :
// Machine 1→L1, 2→L2, 3→L3, 4→L4. Une seule ligne par machine, jamais les autres.
int _lineIndexForMachine(String machine) => ((int.tryParse(machine) ?? 1) - 1).clamp(0, 3);

// ── Champs numériques par bloc ────────────────────────────────────────────────
const _kChamps = [
  ('nbBobines',      'Nombre de bobines',   Icons.radio_button_checked_rounded),
  ('vitesse',        'Vitesse machine',      Icons.speed_rounded),
  ('mesure',         'Mesure (m/min)',       Icons.straighten_rounded),
  ('diametre',       'Diamètre',             Icons.circle_outlined),
  ('poids',          'Poids 1 mètre',        Icons.scale_rounded),
  ('longueurBarre',  'Longueur de barre',    Icons.height_rounded),
  ('longueurDechet', 'Longueur de déchet',   Icons.delete_outline_rounded),
];

// ── Écran ─────────────────────────────────────────────────────────────────────
class ProbarControleQualiteScreen extends StatefulWidget {
  final String machine;
  final String poste;
  final String ficheId;
  const ProbarControleQualiteScreen({
    super.key,
    required this.machine,
    required this.poste,
    required this.ficheId,
  });

  @override
  State<ProbarControleQualiteScreen> createState() => _ProbarControleQualiteScreenState();
}

class _ProbarControleQualiteScreenState extends State<ProbarControleQualiteScreen> {
  late final ProbarController c;

  // Chips OK/NOK — état local, setState pour rebuild
  final List<String?> _validations = [null, null, null, null];

  // 4 slots × 7 champs = 28 TextEditingControllers stables
  late final List<Map<String, TextEditingController>> _fieldCtrls;

  // 1 TextEditingController "heure" par slot (même architecture 4-slots que
  // c.controlesQualite, même si seule la ligne de la machine est affichée).
  late final List<TextEditingController> _heureCtrls;

  bool _loading = true;
  bool _saving  = false;

  @override
  void initState() {
    super.initState();
    c = Get.isRegistered<ProbarController>()
        ? Get.find<ProbarController>()
        : Get.put(ProbarController(), permanent: true);

    _fieldCtrls = List.generate(4, (_) =>
        {for (final (k, _, _) in _kChamps) k: TextEditingController()});
    _heureCtrls = List.generate(4, (_) => TextEditingController());

    _bootstrap();
  }

  @override
  void dispose() {
    for (final m in _fieldCtrls) {
      for (final ctrl in m.values) ctrl.dispose();
    }
    for (final ctrl in _heureCtrls) {
      ctrl.dispose();
    }
    super.dispose();
  }

  // ── Bootstrap ────────────────────────────────────────────────────────────────
  Future<void> _bootstrap() async {
    await c.bootstrapWithId(widget.machine, widget.poste, widget.ficheId);
    if (!mounted) return;
    if (c.isLocked.value) {
      context.go(_fichePath);
      return;
    }
    _ensureSlots();
    _loadLocal(); // c.controlesQualite → contrôleurs locaux + _validations
    setState(() => _loading = false);
  }

  void _ensureSlots() {
    while (c.controlesQualite.length < 4) c.controlesQualite.add(_emptySlot());
    while (c.controlesQualite.length > 4) c.controlesQualite.removeLast();
  }

  Map<String, dynamic> _emptySlot() => {
        'statutCOQ':      null,
        'heure':          '',
        'nbBobines':      '',
        'vitesse':        '',
        'mesure':         '',
        'diametre':       '',
        'poids':          '',
        'longueurBarre':  '',
        'longueurDechet': '',
      };

  // Copie c.controlesQualite vers l'état local (appelé une seule fois au bootstrap)
  void _loadLocal() {
    for (int i = 0; i < 4; i++) {
      if (i < c.controlesQualite.length) {
        final data = c.controlesQualite[i];
        _validations[i] = data['statutCOQ'] as String?;
        // Fiches existantes sans "heure" enregistrée → repli sur l'heure par
        // défaut du créneau (compat, voir _kSlots) — réécrit immédiatement
        // dans c.controlesQualite pour que la valeur affichée soit toujours
        // celle réellement sauvegardée (saveDraft() peut être déclenché sans
        // que l'utilisateur touche ce champ).
        final heure = (data['heure'] as String?)?.trim() ?? '';
        final resolvedHeure = heure.isNotEmpty ? heure : _kSlots[i].$2;
        _heureCtrls[i].text = resolvedHeure;
        data['heure'] = resolvedHeure;
        for (final (key, _, _) in _kChamps) {
          _fieldCtrls[i][key]!.text = data[key]?.toString() ?? '';
        }
      }
    }
  }

  // ── Heure — sélecteur d'heure libre (remplace l'ancien texte fixe) ─────────
  TimeOfDay? _parseHHmm(String text) {
    final parts = text.trim().split(':');
    if (parts.length != 2) return null;
    final h = int.tryParse(parts[0]);
    final m = int.tryParse(parts[1]);
    if (h == null || m == null || h < 0 || h > 23 || m < 0 || m > 59) return null;
    return TimeOfDay(hour: h, minute: m);
  }

  Future<void> _pickHeure(int slotIndex) async {
    final ctrl = _heureCtrls[slotIndex];
    final picked = await showTimePicker(
      context: context,
      initialTime: _parseHHmm(ctrl.text) ?? TimeOfDay.now(),
    );
    if (picked == null) return;
    final formatted = formatTime24h(picked);
    setState(() => ctrl.text = formatted);
    _onFieldChanged(slotIndex, 'heure', formatted);
  }

  // ── Binding direct : chaque frappe écrit dans c.controlesQualite ───────────
  // Mutation en place de la map → saveDraft() depuis n'importe où reçoit
  // toujours les données à jour (y compris depuis ProbarFicheInfoRow).
  void _onFieldChanged(int slotIndex, String fieldKey, String value) {
    if (slotIndex < c.controlesQualite.length) {
      c.controlesQualite[slotIndex][fieldKey] = value;
    }
  }

  // Synchronise uniquement statutCOQ (les champs numériques sont déjà à jour
  // via _onFieldChanged).
  void _syncToController() {
    _ensureSlots();
    for (int i = 0; i < 4; i++) {
      if (i < c.controlesQualite.length) {
        c.controlesQualite[i]['statutCOQ'] = _validations[i];
      }
    }
  }

  // ── Paths ────────────────────────────────────────────────────────────────────
  String get _base =>
      '${MyRoute.productionProbarRoot}/machine/${widget.machine}/poste/${widget.poste}';
  String get _fichePath => '$_base/dashboard';
  String get _modulesPath => '$_base/modules?ficheId=${widget.ficheId}';

  // ── Save ─────────────────────────────────────────────────────────────────────
  Future<void> _save() async {
    if (_saving) return;
    setState(() => _saving = true);
    try {
      _syncToController();
      await c.saveDraft();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(AppLocalizations.of(context).translate('Contrôle Qualité enregistré')),
          backgroundColor: kCrmSuccess,
          duration: const Duration(seconds: 2),
        ));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('${AppLocalizations.of(context).translate('Erreur')} : $e'), backgroundColor: kCrmDanger));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _saveAndNext() async {
    if (_saving) return;
    setState(() => _saving = true);
    try {
      _syncToController();
      await c.saveDraft();
      if (mounted) context.go(_modulesPath);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('${AppLocalizations.of(context).translate('Erreur')} : $e'), backgroundColor: kCrmDanger));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _setValidation(int slotIndex, String value) {
    setState(() => _validations[slotIndex] = value);
  }

  // ── Build ────────────────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    return ProbarModuleScaffold(
      title:         'Contrôle Qualité',
      icon:          Icons.shield_outlined,
      color:         kMaintenanceColor,
      machine:       widget.machine,
      poste:         widget.poste,
      backRoute:     _modulesPath,
      loading:       _loading,
      saving:        _saving,
      onSave:        _save,
      onNext:        _saveAndNext,
      nextLabel:     'Suivant',
      nextIcon:      Icons.arrow_forward_rounded,
      controller:    c,
      child: _QualiteBody(
        machine:             widget.machine,
        validations:         _validations,
        fieldCtrls:          _fieldCtrls,
        heureCtrls:          _heureCtrls,
        onValidationChanged: _setValidation,
        onFieldChanged:      _onFieldChanged,
        onPickHeure:         _pickHeure,
      ),
    );
  }
}

// ── Corps ─────────────────────────────────────────────────────────────────────
// N'affiche plus qu'une seule ligne — celle mappée à la machine de cette
// fiche (voir _lineIndexForMachine) — jamais les 3 autres.
class _QualiteBody extends StatelessWidget {
  final String machine;
  final List<String?> validations;
  final List<Map<String, TextEditingController>> fieldCtrls;
  final List<TextEditingController> heureCtrls;
  final void Function(int slotIndex, String value) onValidationChanged;
  final void Function(int slotIndex, String key, String value) onFieldChanged;
  final void Function(int slotIndex) onPickHeure;

  const _QualiteBody({
    required this.machine,
    required this.validations,
    required this.fieldCtrls,
    required this.heureCtrls,
    required this.onValidationChanged,
    required this.onFieldChanged,
    required this.onPickHeure,
  });

  @override
  Widget build(BuildContext context) {
    final lineIndex = _lineIndexForMachine(machine);
    final label = _kSlots[lineIndex].$1;

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(AppLocalizations.of(context).translate('Contrôle Qualité'),
          style: tInter(fontSize: 16, fontWeight: FontWeight.w900, color: kCrmText)),
      const SizedBox(height: 6),
      Text('${AppLocalizations.of(context).translate('Renseignez les données de contrôle pour la ligne')} $label (${AppLocalizations.of(context).translate('Machine')} $machine).',
          style: tInter(fontSize: 13, color: kCrmTextSub)),
      const SizedBox(height: 24),

      _SlotCard(
        slotIndex:          lineIndex,
        validation:         validations[lineIndex],
        controllers:        fieldCtrls[lineIndex],
        heureCtrl:          heureCtrls[lineIndex],
        onValidationChanged: (val) => onValidationChanged(lineIndex, val),
        onFieldChanged:     (key, val) => onFieldChanged(lineIndex, key, val),
        onPickHeure:        () => onPickHeure(lineIndex),
      ),
    ]);
  }
}

// ── Card créneau ──────────────────────────────────────────────────────────────
class _SlotCard extends StatelessWidget {
  final int slotIndex;
  final String? validation;
  final Map<String, TextEditingController> controllers;
  final TextEditingController heureCtrl;
  final void Function(String value) onValidationChanged;
  final void Function(String key, String value) onFieldChanged;
  final VoidCallback onPickHeure;

  const _SlotCard({
    super.key,
    required this.slotIndex,
    required this.validation,
    required this.controllers,
    required this.heureCtrl,
    required this.onValidationChanged,
    required this.onFieldChanged,
    required this.onPickHeure,
  });

  @override
  Widget build(BuildContext context) {
    final (label, _, color) = _kSlots[slotIndex];

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: kCrmSurface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withOpacity(0.30), width: 1.5),
        boxShadow: [
          BoxShadow(color: color.withOpacity(0.07), blurRadius: 20, offset: const Offset(0, 8)),
        ],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // ── En-tête
        Row(children: [
          Container(
            width: 52, height: 52,
            decoration: BoxDecoration(
              color: color.withOpacity(0.12),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Center(
              child: Text(label,
                  style: tInter(fontSize: 18, fontWeight: FontWeight.w900, color: color)),
            ),
          ),
          const SizedBox(width: 14),
          Text(label,
              style: tInter(fontSize: 20, fontWeight: FontWeight.w900, color: kCrmText)),
          const Spacer(),
          if (validation != null) _ValidationBadge(validation: validation!),
        ]),

        const SizedBox(height: 20),
        Divider(height: 1, color: color.withOpacity(0.18)),
        const SizedBox(height: 20),

        // ── Heure — champ libre (remplace l'ancien texte fixe "07h30")
        Text(AppLocalizations.of(context).translate('Heure'),
            style: tInter(fontSize: 13, fontWeight: FontWeight.w700, color: kCrmText)),
        const SizedBox(height: 10),
        ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 220),
          child: _HeureField(ctrl: heureCtrl, color: color, onTap: onPickHeure),
        ),

        const SizedBox(height: 22),
        Divider(height: 1, color: color.withOpacity(0.12)),
        const SizedBox(height: 20),

        // ── Validation 1ère pièce
        Text(AppLocalizations.of(context).translate('Validation 1ère pièce'),
            style: tInter(fontSize: 13, fontWeight: FontWeight.w700, color: kCrmText)),
        const SizedBox(height: 10),
        Row(children: [
          _ValidationChip(
            label: 'OK', selected: validation == 'OK', negative: false,
            onTap: () => onValidationChanged('OK'),
          ),
          const SizedBox(width: 12),
          _ValidationChip(
            label: 'NOK', selected: validation == 'NOK', negative: true,
            onTap: () => onValidationChanged('NOK'),
          ),
        ]),

        const SizedBox(height: 22),
        Divider(height: 1, color: color.withOpacity(0.12)),
        const SizedBox(height: 20),

        // ── Champs numériques
        Text(AppLocalizations.of(context).translate('Mesures'),
            style: tInter(fontSize: 13, fontWeight: FontWeight.w700, color: kCrmTextSub)),
        const SizedBox(height: 14),
        _ChampsGrid(
          controllers: controllers,
          color: color,
          onChanged: onFieldChanged,
        ),
      ]),
    );
  }
}

// ── Champ "Heure" — sélecteur d'heure (showTimePicker), même style visuel que
// le champ "Heure" de Mesures Qualité (probar_controle_machine_screen.dart).
class _HeureField extends StatelessWidget {
  final TextEditingController ctrl;
  final Color color;
  final VoidCallback onTap;

  const _HeureField({required this.ctrl, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: ctrl,
      builder: (_, __) => InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: InputDecorator(
          decoration: InputDecoration(
            isDense: true,
            suffixIcon: Icon(Icons.schedule_outlined, size: 18, color: color),
            filled: true,
            fillColor: kCrmBg,
            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: const BorderSide(color: kCrmBorder)),
            focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: BorderSide(color: color, width: 2)),
          ),
          child: Text(
            ctrl.text.isEmpty ? '--:--' : ctrl.text,
            style: tInter(fontSize: 13, color: ctrl.text.isEmpty ? kCrmTextSub : kCrmText),
          ),
        ),
      ),
    );
  }
}

// ── Badge en-tête ─────────────────────────────────────────────────────────────
class _ValidationBadge extends StatelessWidget {
  final String validation;
  const _ValidationBadge({required this.validation});

  @override
  Widget build(BuildContext context) {
    final ok = validation == 'OK';
    final c  = ok ? kCrmSuccess : kCrmDanger;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: c.withOpacity(0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: c),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(ok ? Icons.check_circle_rounded : Icons.cancel_rounded, size: 14, color: c),
        const SizedBox(width: 5),
        Text(AppLocalizations.of(context).translate(validation), style: tInter(fontSize: 12, fontWeight: FontWeight.w700, color: c)),
      ]),
    );
  }
}

// ── Chip OK / NOK ─────────────────────────────────────────────────────────────
class _ValidationChip extends StatelessWidget {
  final String label;
  final bool selected;
  final bool negative;
  final VoidCallback onTap;

  const _ValidationChip({
    required this.label,
    required this.selected,
    required this.negative,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final color = negative ? kCrmDanger : kCrmSuccess;
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 26, vertical: 12),
        decoration: BoxDecoration(
          color:        selected ? color.withOpacity(0.12) : kCrmBg,
          borderRadius: BorderRadius.circular(12),
          border:       Border.all(color: selected ? color : kCrmBorder, width: selected ? 2 : 1),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(
            selected
                ? (negative ? Icons.cancel_rounded : Icons.check_circle_rounded)
                : Icons.radio_button_unchecked_rounded,
            size: 18, color: selected ? color : kCrmTextSub,
          ),
          const SizedBox(width: 8),
          Text(AppLocalizations.of(context).translate(label),
              style: tInter(
                fontSize: 15,
                fontWeight: selected ? FontWeight.w800 : FontWeight.w500,
                color: selected ? color : kCrmTextSub,
              )),
        ]),
      ),
    );
  }
}

// ── Grille des champs ─────────────────────────────────────────────────────────
class _ChampsGrid extends StatelessWidget {
  final Map<String, TextEditingController> controllers;
  final Color color;
  final void Function(String key, String value) onChanged;

  const _ChampsGrid({
    required this.controllers,
    required this.color,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final w    = MediaQuery.of(context).size.width;
    final cols = w >= 900 ? 3 : (w >= 560 ? 2 : 1);

    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount:   cols,
        mainAxisSpacing:  12,
        crossAxisSpacing: 12,
        mainAxisExtent:   72,
      ),
      itemCount: _kChamps.length,
      itemBuilder: (_, i) {
        final (key, label, icon) = _kChamps[i];
        return _NumericField(
          key:       ValueKey(key),
          label:     label,
          icon:      icon,
          color:     color,
          ctrl:      controllers[key]!,
          // Écriture directe dans c.controlesQualite à chaque frappe
          onChanged: (v) => onChanged(key, v),
        );
      },
    );
  }
}

// ── Champ numérique ───────────────────────────────────────────────────────────
// StatelessWidget : le ctrl est stable (créé en initState, jamais remplacé).
// onChanged écrit dans c.controlesQualite[slot][key] à chaque frappe.
class _NumericField extends StatelessWidget {
  final String   label;
  final IconData icon;
  final Color    color;
  final TextEditingController ctrl;
  final ValueChanged<String> onChanged;

  const _NumericField({
    super.key,
    required this.label,
    required this.icon,
    required this.color,
    required this.ctrl,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller:      ctrl,
      keyboardType:    const TextInputType.numberWithOptions(decimal: true),
      inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[\d.,]'))],
      onChanged:       onChanged,
      style:           tInter(fontSize: 13, color: kCrmText),
      decoration: InputDecoration(
        labelText:  AppLocalizations.of(context).translate(label),
        prefixIcon: Icon(icon, size: 16, color: color),
        prefixIconConstraints: const BoxConstraints(minWidth: 40),
        filled:     true,
        fillColor:  kCrmBg,
        isDense:    true,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide:   const BorderSide(color: kCrmBorder),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide:   const BorderSide(color: kCrmBorder),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide:   BorderSide(color: color, width: 2),
        ),
        contentPadding:     const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        labelStyle:         tInter(fontSize: 11, color: kCrmTextSub),
        floatingLabelStyle: tInter(fontSize: 11, color: color),
      ),
    );
  }
}
