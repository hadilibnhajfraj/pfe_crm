// lib/forms/industrial/view/melange_form_screen.dart
//
// Fiche MÉLANGE — 3 étapes
//   Étape 1 : Informations générales
//   Étape 2 : Fiche de Suivi Journalier de Mélange
//   Étape 3 : Rapport Journalier de Mélange  ← reproduction fidèle de la fiche papier

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import '../theme/industrial_theme.dart';
import '../model/industrial_record_model.dart';
import '../service/industrial_record_service.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

// ── Groupes Ravitaillement (8 produits × 4 sous-colonnes C/N/P/Qté) ─────────
const List<(String, String)> _kRavGroups = [
  ('cooM',         'COO M'),
  ('bainResine24', 'BAIN RÉSINE 2.4'),
  ('bainResine3',  'BAIN RÉSINE 3'),
  ('bainISO',      'BAIN ISO'),
  ('promesh1',     'PROMESH #1'),
  ('promesh2',     'PROMESH #2'),
  ('promesh3',     'PROMESH #3'),
  ('promesh4',     'PROMESH #4'),
];

const List<(String, String)> _kRavSubCols = [
  ('c', 'C'), ('n', 'N'), ('p', 'P'), ('q', 'Qté'),
];

// ── Colonnes Consommation ────────────────────────────────────────────────────
const List<(String, String)> _kCsoCols = [
  ('resine',       'Résine'),
  ('iso',          'ISO'),
  ('accelerateur', 'Accél.'),
  ('colorant',     'Colorant'),
  ('pg',           'PG'),
];

// ── Groupes Rapport Journalier (paper-exact) ─────────────────────────────────
const List<(String, String)> _kRapGroups = [
  ('h',  'H'),
  ('a',  'A (kg)'),
  ('b',  'B (kg)'),
  ('c',  'C (kg)'),
  ('gc', 'C (Grande\nCuillère)'),
  ('pc', 'D (Petite\nCuillère)'),
];
const List<String> _kLines = ['L1', 'L2', 'L3', 'L4'];

// ── Dimensions générales ──────────────────────────────────────────────────────
const double _kNW  = 58.0;   // numeric cell width (consommation)
const double _kDW  = 38.0;   // delete button width
const double _kRH  = 50.0;   // row height
const double _kH1  = 40.0;   // header level-1 height
const double _kH2  = 26.0;   // header level-2 height

// ── Dimensions Rapport ────────────────────────────────────────────────────────
const double _kRapNW  = 40.0;
const double _kRapCW  = 52.0;
const double _kRapTH  = 486.0;

const _kBdr    = BorderSide(color: Color(0xFFE2E8F0));
const _kRavBdr = BorderSide(color: Colors.black, width: 0.5);

// ── Nombre de lignes par défaut ───────────────────────────────────────────────
const int _kDefaultRows = 21;

// ─────────────────────────────────────────────────────────────────────────────
// Controller helpers
// ─────────────────────────────────────────────────────────────────────────────

/// Ravitaillement row: Qté (first col) + 8 groups × 4 sub-cols
class _RavRowCtrls {
  final TextEditingController qte = TextEditingController();
  final Map<String, TextEditingController> cells = {
    for (final (g, _) in _kRavGroups)
      for (final (s, _) in _kRavSubCols) '${g}_$s': TextEditingController(),
  };
  void dispose() {
    qte.dispose();
    for (final c in cells.values) c.dispose();
  }
}

class _CsoRowCtrls {
  final Map<String, TextEditingController> cells = {
    for (final (k, _) in _kCsoCols) k: TextEditingController(),
  };
  void dispose() {
    for (final c in cells.values) c.dispose();
  }
}

class _RapRowCtrls {
  // All 6 groups × 4 lines = 24 cells per row
  final Map<String, TextEditingController> cells = {
    for (final (g, _) in _kRapGroups)
      for (final l in _kLines) '${g}_$l': TextEditingController(),
  };
  void dispose() {
    for (final c in cells.values) c.dispose();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MelangeFormScreen
// ─────────────────────────────────────────────────────────────────────────────
class MelangeFormScreen extends StatefulWidget {
  final String? id;
  const MelangeFormScreen({super.key, this.id});
  @override
  State<MelangeFormScreen> createState() => _MelangeFormScreenState();
}

class _MelangeFormScreenState extends State<MelangeFormScreen> {
  int  _step  = 0;
  bool _saving = false;
  bool _loadingEdit = false;
  String? _recordId;

  // Étape 2 / Étape 3 : les ~1270 TextEditingController du tableau fixe ne
  // sont alloués qu'à la première visite de chaque étape (ou avant Save si
  // jamais visitée) — pas au premier build — pour que l'écran "Nouvelle
  // fiche" s'affiche immédiatement (voir _ensureStep2Ctrls/_ensureStep3Ctrls).
  bool _step2Ready = false;
  bool _step3Ready = false;

  late final Stopwatch _pageStopwatch = Stopwatch()..start();

  // ── Étape 1 ────────────────────────────────────────────────────────────────
  final _date        = TextEditingController(text: DateFormat('yyyy-MM-dd').format(DateTime.now()));
  final _heureDebut  = TextEditingController();
  final _heureFin    = TextEditingController();
  final _operateur   = TextEditingController();
  final _remarqueGen = TextEditingController();

  // ── Étape 2 — Ravitaillement (21 lignes fixes + 2 lignes footer) ───────────
  final List<_RavRowCtrls> _ravCtrls = [];
  late final _RavRowCtrls  _melangesRow;
  late final _RavRowCtrls  _totalRow;

  // ── Étape 2 — Consommation ─────────────────────────────────────────────────
  final List<_CsoRowCtrls> _csoCtrls = [];

  // ── Étape 2 — Remarques & Signature ───────────────────────────────────────
  final _remarques2 = TextEditingController();
  final _signature  = TextEditingController();

  // ── Étape 3 — En-tête Rapport ──────────────────────────────────────────────
  final _rapDate   = TextEditingController(text: DateFormat('yyyy-MM-dd').format(DateTime.now()));
  final _rapZone   = TextEditingController();
  final _rapOp     = TextEditingController();
  final _rapHD     = TextEditingController();
  final _rapHF     = TextEditingController();

  // ── Étape 3 — Tableau Rapport ──────────────────────────────────────────────
  final List<_RapRowCtrls> _rapCtrls = [];

  // ── Étape 3 — Chute fibre ──────────────────────────────────────────────────
  final Map<String, TextEditingController> _chuteCtrls = {
    for (final l in _kLines) l: TextEditingController(),
  };

  // ── Init / Dispose ─────────────────────────────────────────────────────────
  @override
  void initState() {
    super.initState();
    _melangesRow = _RavRowCtrls();
    _totalRow    = _RavRowCtrls();
    if (widget.id != null) {
      _loadingEdit = true;
      // _loadForEdit peuple _ravCtrls/_csoCtrls/_rapCtrls elle-même à partir
      // des données existantes — pas besoin d'allocation par défaut ici.
      _step2Ready = true;
      _step3Ready = true;
      _loadForEdit(widget.id!);
    }
    // Cas "Nouvelle fiche" : Étape 1 seule (5 contrôleurs) — Étape 2/3
    // allouées à la demande, voir _ensureStep2Ctrls/_ensureStep3Ctrls.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      debugPrint('[melange] Formulaire — premier frame affiché en ${_pageStopwatch.elapsedMilliseconds}ms');
    });
  }

  void _ensureStep2Ctrls() {
    if (_step2Ready) return;
    _step2Ready = true;
    final sw = Stopwatch()..start();
    for (int i = 0; i < _kDefaultRows; i++) _ravCtrls.add(_RavRowCtrls());
    _csoCtrls.add(_CsoRowCtrls());
    debugPrint('[melange] Étape 2 initialisée (${_ravCtrls.length} lignes ravitaillement) en ${sw.elapsedMilliseconds}ms');
  }

  void _ensureStep3Ctrls() {
    if (_step3Ready) return;
    _step3Ready = true;
    final sw = Stopwatch()..start();
    for (int i = 0; i < _kDefaultRows; i++) _rapCtrls.add(_RapRowCtrls());
    debugPrint('[melange] Étape 3 initialisée (${_rapCtrls.length} lignes rapport) en ${sw.elapsedMilliseconds}ms');
  }

  // ── Chargement d'une fiche existante (mode édition) ─────────────────────────
  // Inverse de _save() : reconstruit tous les contrôleurs à partir du
  // `melangeData` déjà enregistré, sans présumer du nombre de lignes stocké.
  Future<void> _loadForEdit(String id) async {
    try {
      final r = await IndustrialRecordService.instance.fetchById(id);
      if (!mounted) return;
      final data = r.melangeData ?? const <String, dynamic>{};

      _recordId = r.id;
      _date.text = r.dateFiche ?? _date.text;
      _operateur.text = r.operateur ?? (data['operateur']?.toString() ?? '');
      _heureDebut.text = data['heureDebut']?.toString() ?? '';
      _heureFin.text = data['heureFin']?.toString() ?? '';
      _remarqueGen.text = data['remarqueGen']?.toString() ?? '';

      final rav = (data['ravitaillement'] as Map?)?.cast<String, dynamic>();
      final ravLignes = (rav?['lignes'] as List?) ?? const [];

      void fillRavRow(_RavRowCtrls target, Map? source) {
        final m = source ?? const {};
        target.qte.text = m['qte']?.toString() ?? '';
        for (final (g, _) in _kRavGroups) {
          for (final (s, _) in _kRavSubCols) {
            target.cells['${g}_$s']!.text = m['${g}_$s']?.toString() ?? '';
          }
        }
      }

      for (final raw in ravLignes) {
        final row = _RavRowCtrls();
        fillRavRow(row, raw is Map ? raw : null);
        _ravCtrls.add(row);
      }
      if (_ravCtrls.isEmpty) {
        for (int i = 0; i < _kDefaultRows; i++) _ravCtrls.add(_RavRowCtrls());
      }
      fillRavRow(_melangesRow, rav?['melanges'] as Map?);
      fillRavRow(_totalRow, rav?['totalEnKg'] as Map?);

      final cso = (data['consommation'] as List?) ?? const [];
      for (final raw in cso) {
        final row = _CsoRowCtrls();
        final m = (raw is Map) ? raw : const {};
        for (final (k, _) in _kCsoCols) row.cells[k]!.text = m[k]?.toString() ?? '';
        _csoCtrls.add(row);
      }
      if (_csoCtrls.isEmpty) _csoCtrls.add(_CsoRowCtrls());

      _remarques2.text = data['remarques']?.toString() ?? '';
      _signature.text = data['signature']?.toString() ?? '';

      final rapport = (data['rapport'] as Map?)?.cast<String, dynamic>();
      _rapDate.text = rapport?['date']?.toString() ?? _rapDate.text;
      _rapZone.text = rapport?['zone']?.toString() ?? '';
      _rapOp.text = rapport?['operateur']?.toString() ?? '';
      _rapHD.text = rapport?['heureDebut']?.toString() ?? '';
      _rapHF.text = rapport?['heureFin']?.toString() ?? '';

      final rapLignes = (rapport?['lignes'] as List?) ?? const [];
      for (final raw in rapLignes) {
        final row = _RapRowCtrls();
        final m = (raw is Map) ? raw : const {};
        for (final (g, _) in _kRapGroups) {
          for (final l in _kLines) row.cells['${g}_$l']!.text = m['${g}_$l']?.toString() ?? '';
        }
        _rapCtrls.add(row);
      }
      if (_rapCtrls.isEmpty) {
        for (int i = 0; i < _kDefaultRows; i++) _rapCtrls.add(_RapRowCtrls());
      }

      final chute = (data['chuteFibre'] as Map?)?.cast<String, dynamic>() ?? const {};
      for (final l in _kLines) _chuteCtrls[l]!.text = chute[l]?.toString() ?? '';
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content: Text('${AppLocalizations.of(context).translate('Erreur de chargement')} : $e'),
              backgroundColor: kCrmDanger),
        );
      }
    } finally {
      if (mounted) setState(() => _loadingEdit = false);
      debugPrint('[melange] Formulaire (édition) — données affichées en ${_pageStopwatch.elapsedMilliseconds}ms (total)');
    }
  }

  @override
  void dispose() {
    _date.dispose(); _heureDebut.dispose(); _heureFin.dispose();
    _operateur.dispose(); _remarqueGen.dispose();
    for (final r in _ravCtrls) r.dispose();
    _melangesRow.dispose();
    _totalRow.dispose();
    for (final r in _csoCtrls) r.dispose();
    _remarques2.dispose(); _signature.dispose();
    _rapDate.dispose(); _rapZone.dispose(); _rapOp.dispose();
    _rapHD.dispose(); _rapHF.dispose();
    for (final r in _rapCtrls) r.dispose();
    for (final c in _chuteCtrls.values) c.dispose();
    super.dispose();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  void _addCsoRow()     => setState(() => _csoCtrls.add(_CsoRowCtrls()));
  void _removeCsoRow(int i) {
    if (_csoCtrls.length <= 1) return;
    setState(() { _csoCtrls[i].dispose(); _csoCtrls.removeAt(i); });
  }

  void _addRapRow()     => setState(() => _rapCtrls.add(_RapRowCtrls()));
  void _removeRapRow(int i) {
    if (_rapCtrls.length <= 1) return;
    setState(() { _rapCtrls[i].dispose(); _rapCtrls.removeAt(i); });
  }

  // ── Totaux ─────────────────────────────────────────────────────────────────
  double _groupTotal(String g) {
    double s = 0;
    for (final r in _rapCtrls) {
      for (final l in _kLines) s += double.tryParse(r.cells['${g}_$l']!.text) ?? 0;
    }
    return s;
  }

  // ── Sauvegarde ─────────────────────────────────────────────────────────────
  Future<void> _save() async {
    if (_saving) return;
    // Garantit la structure complète (21 lignes) même si l'utilisateur
    // enregistre depuis l'Étape 1 sans avoir visité l'Étape 2/3.
    _ensureStep2Ctrls();
    _ensureStep3Ctrls();
    setState(() => _saving = true);
    try {
      final rapLignes = <Map<String, String>>[];
      for (final r in _rapCtrls) {
        final line = <String, String>{};
        for (final (g, _) in _kRapGroups) {
          for (final l in _kLines) line['${g}_$l'] = r.cells['${g}_$l']!.text.trim();
        }
        rapLignes.add(line);
      }

      Map<String, String> serializeRavRow(_RavRowCtrls r) => {
        'qte': r.qte.text.trim(),
        for (final (g, _) in _kRavGroups)
          for (final (s, _) in _kRavSubCols) '${g}_$s': r.cells['${g}_$s']!.text.trim(),
      };

      final melangeData = <String, dynamic>{
        if (_heureDebut.text.trim().isNotEmpty)  'heureDebut':   _heureDebut.text.trim(),
        if (_heureFin.text.trim().isNotEmpty)    'heureFin':     _heureFin.text.trim(),
        if (_operateur.text.trim().isNotEmpty)   'operateur':    _operateur.text.trim(),
        if (_remarqueGen.text.trim().isNotEmpty) 'remarqueGen':  _remarqueGen.text.trim(),
        'ravitaillement': <String, dynamic>{
          'lignes':    [for (final r in _ravCtrls) serializeRavRow(r)],
          'melanges':  serializeRavRow(_melangesRow),
          'totalEnKg': serializeRavRow(_totalRow),
        },
        'consommation': [
          for (final r in _csoCtrls)
            <String, String>{ for (final (k, _) in _kCsoCols) k: r.cells[k]!.text.trim() },
        ],
        if (_remarques2.text.trim().isNotEmpty) 'remarques': _remarques2.text.trim(),
        if (_signature.text.trim().isNotEmpty)  'signature': _signature.text.trim(),
        'rapport': <String, dynamic>{
          'date':       _rapDate.text.trim(),
          'zone':       _rapZone.text.trim(),
          'operateur':  _rapOp.text.trim(),
          'heureDebut': _rapHD.text.trim(),
          'heureFin':   _rapHF.text.trim(),
          'lignes':     rapLignes,
        },
        'chuteFibre': <String, String>{ for (final l in _kLines) l: _chuteCtrls[l]!.text.trim() },
      };

      final model = IndustrialRecordModel(
        id:          _recordId,
        module:      'melange',
        dateFiche:   _date.text.trim().isEmpty ? null : _date.text.trim(),
        operateur:   _operateur.text.trim().isEmpty ? null : _operateur.text.trim(),
        description: null,
        melangeData: melangeData,
        statut:      'enregistree',
      );

      final saved = _recordId == null
          ? await IndustrialRecordService.instance.create(model)
          : await IndustrialRecordService.instance.update(_recordId!, model);
      _recordId = saved.id ?? _recordId;

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(AppLocalizations.of(context).translate('Fiche enregistrée')),
        backgroundColor: kMelangeColor,
        duration: const Duration(seconds: 2),
      ));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('${AppLocalizations.of(context).translate('Erreur')} : $e'), backgroundColor: kCrmDanger,
        duration: const Duration(seconds: 3),
      ));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  // ── Build ──────────────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kCrmBg,
      body: SafeArea(
        child: Column(children: [
          _TopBar(onBack: () => context.go(MyRoute.melangeHistoriqueScreen)),
          _StepIndicator(step: _step),
          Expanded(
            child: _loadingEdit
                ? const Center(child: CircularProgressIndicator())
                : IndexedStack(
              index: _step,
              children: [
                _Step1(date: _date, heureDebut: _heureDebut, heureFin: _heureFin,
                    operateur: _operateur, remarque: _remarqueGen),
                _Step2(
                  ravCtrls: _ravCtrls, melangesRow: _melangesRow, totalRow: _totalRow,
                  csoCtrls: _csoCtrls, onCsoRemove: _removeCsoRow, onCsoAdd: _addCsoRow,
                  remarques: _remarques2, signature: _signature,
                ),
                _Step3(
                  rapDate: _rapDate, rapZone: _rapZone, rapOp: _rapOp,
                  rapHD: _rapHD, rapHF: _rapHF,
                  rapCtrls: _rapCtrls, onAdd: _addRapRow, onRemove: _removeRapRow,
                  groupTotal: _groupTotal, chuteCtrls: _chuteCtrls,
                  onCellChanged: () => setState(() {}),
                ),
              ],
            ),
          ),
          _BottomNav(
            step: _step, saving: _saving,
            onPrev: _step > 0 ? () => setState(() => _step--) : null,
            onNext: _step < 2
                ? () => setState(() {
                      // Alloue les contrôleurs de l'étape suivante juste avant
                      // de l'afficher — jamais au chargement initial de la page.
                      if (_step == 0) _ensureStep2Ctrls();
                      if (_step == 1) _ensureStep3Ctrls();
                      _step++;
                    })
                : null,
            onSave: _step == 2 ? _save : null,
            onSaveIntermediate: _save,
          ),
        ]),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Top bar
// ─────────────────────────────────────────────────────────────────────────────
class _TopBar extends StatelessWidget {
  final VoidCallback onBack;
  const _TopBar({required this.onBack});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: const BoxDecoration(color: kCrmSurface,
          border: Border(bottom: BorderSide(color: Color(0xFFE2E8F0)))),
      child: Row(children: [
        InkWell(onTap: onBack, borderRadius: BorderRadius.circular(8),
            child: Container(padding: const EdgeInsets.all(7),
                decoration: BoxDecoration(border: Border.all(color: kCrmBorder),
                    borderRadius: BorderRadius.circular(8)),
                child: const Icon(Icons.arrow_back_rounded, size: 16, color: kCrmTextSub))),
        const SizedBox(width: 14),
        Container(width: 36, height: 36,
            decoration: BoxDecoration(color: kMelangeColor.withOpacity(0.12),
                borderRadius: BorderRadius.circular(10)),
            child: const Icon(Icons.science_outlined, size: 20, color: kMelangeColor)),
        const SizedBox(width: 10),
        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(AppLocalizations.of(context).translate('Fiche MÉLANGE'),
              style: tInter(fontSize: 16, fontWeight: FontWeight.w900, color: kCrmText)),
          Text(AppLocalizations.of(context).translate('Saisie de production'),
              style: tInter(fontSize: 11, color: kCrmTextSub)),
        ]),
      ]),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Step indicator
// ─────────────────────────────────────────────────────────────────────────────
class _StepIndicator extends StatelessWidget {
  final int step;
  const _StepIndicator({required this.step});
  static const _labels = ['Infos générales', 'Suivi journalier', 'Rapport journalier'];

  @override
  Widget build(BuildContext context) {
    return Container(
      color: kCrmSurface,
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
      child: Row(children: [
        for (int i = 0; i < 3; i++) ...[
          if (i > 0) Expanded(child: Container(height: 2,
              color: i <= step ? kMelangeColor : const Color(0xFFE2E8F0))),
          _dot(context, i),
        ],
      ]),
    );
  }

  Widget _dot(BuildContext context, int i) {
    final done = i < step;
    final cur  = i == step;
    return Column(mainAxisSize: MainAxisSize.min, children: [
      AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        width: 28, height: 28,
        decoration: BoxDecoration(shape: BoxShape.circle,
            color: done || cur ? kMelangeColor : const Color(0xFFE2E8F0)),
        child: Center(child: done
            ? const Icon(Icons.check_rounded, size: 14, color: Colors.white)
            : Text('${i+1}', style: tInter(fontSize: 12, fontWeight: FontWeight.w900,
                color: cur ? Colors.white : const Color(0xFF94A3B8)))),
      ),
      const SizedBox(height: 4),
      SizedBox(width: 84, child: Text(AppLocalizations.of(context).translate(_labels[i]), textAlign: TextAlign.center,
          style: tInter(fontSize: 9, fontWeight: FontWeight.w600,
              color: i <= step ? kMelangeColor : const Color(0xFF94A3B8)))),
    ]);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bottom navigation
// ─────────────────────────────────────────────────────────────────────────────
class _BottomNav extends StatelessWidget {
  final int step;
  final bool saving;
  final VoidCallback? onPrev, onNext, onSave, onSaveIntermediate;
  const _BottomNav({required this.step, required this.saving,
      required this.onPrev, required this.onNext,
      required this.onSave, required this.onSaveIntermediate});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: const BoxDecoration(color: kCrmSurface,
          border: Border(top: BorderSide(color: Color(0xFFE2E8F0)))),
      child: Row(children: [
        if (onPrev != null)
          OutlinedButton.icon(onPressed: onPrev,
              icon: const Icon(Icons.arrow_back_rounded, size: 16),
              label: Text(AppLocalizations.of(context).translate('Précédent')),
              style: OutlinedButton.styleFrom(foregroundColor: kCrmTextSub,
                  side: const BorderSide(color: Color(0xFFCBD5E1)),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12))),
        const Spacer(),
        OutlinedButton.icon(
          onPressed: saving ? null : onSaveIntermediate,
          icon: saving
              ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.save_outlined, size: 16),
          label: Text(AppLocalizations.of(context).translate('Enregistrer')),
          style: OutlinedButton.styleFrom(foregroundColor: kMelangeColor,
              side: BorderSide(color: kMelangeColor.withOpacity(0.5)),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12)),
        ),
        if (onNext != null) ...[
          const SizedBox(width: 8),
          ElevatedButton.icon(onPressed: onNext,
              icon: const Icon(Icons.arrow_forward_rounded, size: 16),
              label: Text(AppLocalizations.of(context).translate('Suivant')),
              style: ElevatedButton.styleFrom(backgroundColor: kMelangeColor,
                  foregroundColor: Colors.white, elevation: 0,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12))),
        ],
        if (onSave != null) ...[
          const SizedBox(width: 8),
          ElevatedButton.icon(onPressed: saving ? null : onSave,
              icon: const Icon(Icons.check_rounded, size: 16),
              label: Text(AppLocalizations.of(context).translate('Terminer')),
              style: ElevatedButton.styleFrom(backgroundColor: kMelangeColor,
                  foregroundColor: Colors.white, elevation: 0,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12))),
        ],
      ]),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ÉTAPE 1 — Informations générales
// ─────────────────────────────────────────────────────────────────────────────
class _Step1 extends StatelessWidget {
  final TextEditingController date, heureDebut, heureFin, operateur, remarque;
  const _Step1({required this.date, required this.heureDebut, required this.heureFin,
      required this.operateur, required this.remarque});

  InputDecoration _dec(BuildContext context, String label, IconData icon) => InputDecoration(
    labelText: AppLocalizations.of(context).translate(label), labelStyle: tInter(fontSize: 13, color: kCrmTextSub),
    prefixIcon: Icon(icon, size: 18, color: kMelangeColor),
    filled: true, fillColor: kCrmBg,
    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
    border:        OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: Color(0xFFE2E8F0))),
    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: Color(0xFFE2E8F0))),
    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: kMelangeColor, width: 1.5)),
  );

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        _SectionTitle(icon: Icons.info_outline_rounded, title: 'Informations générales'),
        const SizedBox(height: 20),
        _Card(child: Column(children: [
          Row(children: [
            Expanded(child: TextField(controller: date, decoration: _dec(context, 'Date', Icons.calendar_today_rounded),
                style: tInter(fontSize: 14, color: kCrmText))),
            const SizedBox(width: 12),
            Expanded(child: TextField(controller: operateur, decoration: _dec(context, 'Opérateur', Icons.person_outline_rounded),
                style: tInter(fontSize: 14, color: kCrmText))),
          ]),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(child: TextField(controller: heureDebut, decoration: _dec(context, 'Heure début', Icons.schedule_rounded),
                style: tInter(fontSize: 14, color: kCrmText))),
            const SizedBox(width: 12),
            Expanded(child: TextField(controller: heureFin, decoration: _dec(context, 'Heure fin', Icons.schedule_rounded),
                style: tInter(fontSize: 14, color: kCrmText))),
          ]),
          const SizedBox(height: 12),
          TextField(controller: remarque, maxLines: 3,
              decoration: _dec(context, 'Remarque générale (optionnel)', Icons.notes_rounded),
              style: tInter(fontSize: 14, color: kCrmText)),
        ])),
      ]),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ÉTAPE 2 — Suivi Journalier de Mélange
// ─────────────────────────────────────────────────────────────────────────────
class _Step2 extends StatelessWidget {
  final List<_RavRowCtrls> ravCtrls;
  final _RavRowCtrls melangesRow;
  final _RavRowCtrls totalRow;
  final List<_CsoRowCtrls> csoCtrls;
  final void Function(int) onCsoRemove;
  final VoidCallback onCsoAdd;
  final TextEditingController remarques, signature;

  const _Step2({
    required this.ravCtrls, required this.melangesRow, required this.totalRow,
    required this.csoCtrls, required this.onCsoRemove, required this.onCsoAdd,
    required this.remarques, required this.signature,
  });

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        _SectionTitle(icon: Icons.local_shipping_outlined, title: 'Suivi Ravitaillement des Lignes en Mélange'),
        const SizedBox(height: 12),
        _Card(noPad: true, child: _RavTable(
          rows: ravCtrls, melangesRow: melangesRow, totalRow: totalRow,
        )),
        const SizedBox(height: 20),
        _SectionTitle(icon: Icons.science_outlined, title: 'Suivi Consommation Produit Chimique'),
        const SizedBox(height: 12),
        _Card(noPad: true, child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          _CsoTable(csoCtrls: csoCtrls, onRemove: onCsoRemove),
          _AddBtn(label: '+ Ajouter consommation', onTap: onCsoAdd),
        ])),
        const SizedBox(height: 20),
        _SectionTitle(icon: Icons.draw_outlined, title: 'Remarques & Signature'),
        const SizedBox(height: 12),
        _Card(child: Column(children: [
          _LabeledField(label: 'Remarques', ctrl: remarques, maxLines: 3),
          const SizedBox(height: 12),
          _LabeledField(label: 'Signature', ctrl: signature),
        ])),
        const SizedBox(height: 20),
      ]),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tableau Ravitaillement — sticky Qté column + sticky 2-level header
// Reproduction exacte de la fiche papier :
//   • Colonne 1 : Qté
//   • 8 groupes × 4 sous-colonnes (C | N | P | Qté)
//   • 21 lignes de données + 2 lignes footer (MÉLANGES / TOTAL EN KG)
// ─────────────────────────────────────────────────────────────────────────────
class _RavTable extends StatefulWidget {
  final List<_RavRowCtrls> rows;
  final _RavRowCtrls melangesRow;
  final _RavRowCtrls totalRow;

  const _RavTable({required this.rows, required this.melangesRow, required this.totalRow});

  @override
  State<_RavTable> createState() => _RavTableState();
}

class _RavTableState extends State<_RavTable> {
  final _hBody = ScrollController();
  final _hHead = ScrollController();
  final _vBody = ScrollController();
  final _vQte  = ScrollController();

  static const double _qW   = 52.0;   // sticky Qté column
  static const double _cW   = 36.0;   // sub-column width (C / N / P / Qté)
  static const double _rH   = 36.0;   // data row height
  static const double _h1   = 36.0;   // header level 1 (group names)
  static const double _h2   = 24.0;   // header level 2 (C N P Qté labels)
  static const double _tabH = 520.0;  // total widget height

  double get _hdrH => _h1 + _h2;                                    // 60
  double get _bH   => _tabH - _hdrH;                                 // 460
  double get _scrollW => _kRavGroups.length * _kRavSubCols.length * _cW; // 8×4×36 = 1152
  int    get _total   => widget.rows.length + 2;                     // 21 + 2 = 23

  @override
  void initState() {
    super.initState();
    _hBody.addListener(_onHScroll);
    _vBody.addListener(_onVScroll);
  }

  void _onHScroll() {
    if (!_hHead.hasClients || !_hHead.position.hasContentDimensions) return;
    final mx = _hHead.position.maxScrollExtent;
    if (mx <= 0) return;
    _hHead.jumpTo(_hBody.offset.clamp(0.0, mx));
  }

  void _onVScroll() {
    if (!_vQte.hasClients || !_vQte.position.hasContentDimensions) return;
    final mx = _vQte.position.maxScrollExtent;
    if (mx <= 0) return;
    _vQte.jumpTo(_vBody.offset.clamp(0.0, mx));
  }

  @override
  void dispose() {
    _hBody.removeListener(_onHScroll);
    _vBody.removeListener(_onVScroll);
    _hBody.dispose(); _hHead.dispose();
    _vBody.dispose(); _vQte.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: _tabH,
      child: Column(children: [

        // ── Sticky 2-level header ─────────────────────────────────────────────
        SizedBox(
          height: _hdrH,
          child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            // Qté header (spans both header rows)
            Container(
              width: _qW, height: _hdrH,
              decoration: const BoxDecoration(
                color: Color(0xFFE2E8F0),
                border: Border(
                  top: _kRavBdr, left: _kRavBdr, right: _kRavBdr, bottom: _kRavBdr,
                ),
              ),
              child: Center(child: Text(AppLocalizations.of(context).translate('Qté'),
                  style: tInter(fontSize: 11, fontWeight: FontWeight.w800, color: kCrmText))),
            ),
            // Group + sub-col headers (follow body horizontal scroll)
            Expanded(child: SingleChildScrollView(
              controller: _hHead,
              scrollDirection: Axis.horizontal,
              physics: const NeverScrollableScrollPhysics(),
              child: SizedBox(
                width: _scrollW,
                child: Column(children: [_buildHdr1(), _buildHdr2()]),
              ),
            )),
          ]),
        ),

        // ── Body (sticky Qté column + scrollable data) ────────────────────────
        SizedBox(
          height: _bH,
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [

            // Sticky Qté column
            SizedBox(
              width: _qW,
              child: ListView.builder(
                controller: _vQte,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: _total,
                itemExtent: _rH,
                itemBuilder: (_, i) => _buildQteCell(i),
              ),
            ),

            // Data cells (both axes scrollable)
            Expanded(
              child: SingleChildScrollView(
                controller: _hBody,
                scrollDirection: Axis.horizontal,
                child: SizedBox(
                  width: _scrollW,
                  child: ListView.builder(
                    controller: _vBody,
                    itemCount: _total,
                    itemExtent: _rH,
                    itemBuilder: (_, i) => _buildDataRow(i),
                  ),
                ),
              ),
            ),
          ]),
        ),
      ]),
    );
  }

  // ── Header row 1 : group names ───────────────────────────────────────────────
  Widget _buildHdr1() {
    final gW = _kRavSubCols.length * _cW; // 4 × 36 = 144
    return Row(children: [
      for (int gi = 0; gi < _kRavGroups.length; gi++)
        Container(
          width: gW, height: _h1,
          decoration: BoxDecoration(
            color: const Color(0xFFE2E8F0),
            border: Border(
              top: _kRavBdr, right: _kRavBdr, bottom: _kRavBdr,
              left: gi == 0 ? _kRavBdr : BorderSide.none,
            ),
          ),
          child: Center(child: Text(AppLocalizations.of(context).translate(_kRavGroups[gi].$2), textAlign: TextAlign.center,
              style: tInter(fontSize: 8, fontWeight: FontWeight.w800, color: kCrmText))),
        ),
    ]);
  }

  // ── Header row 2 : C | N | P | Qté sub-labels ───────────────────────────────
  Widget _buildHdr2() {
    return Row(children: [
      for (int gi = 0; gi < _kRavGroups.length; gi++)
        for (int si = 0; si < _kRavSubCols.length; si++)
          Container(
            width: _cW, height: _h2,
            decoration: BoxDecoration(
              color: const Color(0xFFF1F5F9),
              border: Border(
                left: gi == 0 && si == 0 ? _kRavBdr : BorderSide.none,
                right: _kRavBdr, bottom: _kRavBdr,
              ),
            ),
            child: Center(child: Text(AppLocalizations.of(context).translate(_kRavSubCols[si].$2),
                style: tInter(fontSize: 9, fontWeight: FontWeight.w700, color: kCrmText))),
          ),
    ]);
  }

  // ── Sticky Qté cell per row ──────────────────────────────────────────────────
  Widget _buildQteCell(int i) {
    final isData     = i < widget.rows.length;
    final isMelanges = i == widget.rows.length;

    if (isData) {
      return Container(
        height: _rH,
        decoration: const BoxDecoration(
          color: Colors.white,
          border: Border(
            left: _kRavBdr, right: _kRavBdr, bottom: _kRavBdr,
          ),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 3),
        child: Center(child: TextField(
          controller: widget.rows[i].qte,
          textAlign: TextAlign.center,
          textInputAction: TextInputAction.next,
          style: tInter(fontSize: 11, color: kCrmText),
          decoration: const InputDecoration(
            border: InputBorder.none, isDense: true, contentPadding: EdgeInsets.zero,
          ),
        )),
      );
    }

    // Footer label cell
    return Container(
      height: _rH,
      decoration: const BoxDecoration(
        color: Color(0xFFF1F5F9),
        border: Border(left: _kRavBdr, right: _kRavBdr, bottom: _kRavBdr),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 2),
      child: Center(child: Text(
        AppLocalizations.of(context).translate(isMelanges ? 'MÉLANGES' : 'TOTAL\nEN KG'),
        textAlign: TextAlign.center,
        style: tInter(fontSize: 7, fontWeight: FontWeight.w800, color: kCrmText),
      )),
    );
  }

  // ── Data row ─────────────────────────────────────────────────────────────────
  Widget _buildDataRow(int i) {
    final isData     = i < widget.rows.length;
    final isMelanges = i == widget.rows.length;

    final _RavRowCtrls ctrls;
    if (isData) {
      ctrls = widget.rows[i];
    } else if (isMelanges) {
      ctrls = widget.melangesRow;
    } else {
      ctrls = widget.totalRow;
    }

    final bool isFooter = !isData;
    final cells = <Widget>[];

    for (int gi = 0; gi < _kRavGroups.length; gi++) {
      final g = _kRavGroups[gi].$1;
      for (int si = 0; si < _kRavSubCols.length; si++) {
        final s   = _kRavSubCols[si].$1;
        final key = '${g}_$s';
        cells.add(Container(
          width: _cW, height: _rH,
          decoration: BoxDecoration(
            color: isFooter ? const Color(0xFFF1F5F9) : Colors.white,
            border: Border(
              left: gi == 0 && si == 0 ? _kRavBdr : BorderSide.none,
              right: _kRavBdr, bottom: _kRavBdr,
            ),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 2),
          child: Center(child: TextField(
            controller: ctrls.cells[key],
            textAlign: TextAlign.center,
            textInputAction: TextInputAction.next,
            style: tInter(fontSize: 11,
                fontWeight: isFooter ? FontWeight.w700 : FontWeight.w400,
                color: kCrmText),
            decoration: const InputDecoration(
              border: InputBorder.none, isDense: true, contentPadding: EdgeInsets.zero,
            ),
          )),
        ));
      }
    }

    return SizedBox(height: _rH, child: Row(children: cells));
  }
}

// ── Tableau Consommation ─────────────────────────────────────────────────────
class _CsoTable extends StatelessWidget {
  final List<_CsoRowCtrls> csoCtrls;
  final void Function(int) onRemove;
  const _CsoTable({required this.csoCtrls, required this.onRemove});

  @override
  Widget build(BuildContext context) {
    const cW = _kNW + 12.0;
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          for (int i = 0; i < _kCsoCols.length; i++)
            Container(width: cW, height: _kH1,
                decoration: BoxDecoration(color: const Color(0xFFF1F5F9),
                    border: Border(left: i == 0 ? _kBdr : BorderSide.none,
                        right: _kBdr, top: _kBdr, bottom: _kBdr)),
                child: Center(child: Text(AppLocalizations.of(context).translate(_kCsoCols[i].$2), textAlign: TextAlign.center,
                    style: tInter(fontSize: 11, fontWeight: FontWeight.w800, color: kCrmText)))),
          SizedBox(width: _kDW),
        ]),
        for (int ri = 0; ri < csoCtrls.length; ri++)
          SizedBox(height: _kRH, child: Row(children: [
            for (int ci = 0; ci < _kCsoCols.length; ci++)
              Container(width: cW, height: _kRH,
                  decoration: BoxDecoration(border: Border(
                      left: ci == 0 ? _kBdr : BorderSide.none, right: _kBdr, bottom: _kBdr)),
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  child: Center(child: TextField(
                    controller: csoCtrls[ri].cells[_kCsoCols[ci].$1],
                    textAlign: TextAlign.center,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                    textInputAction: TextInputAction.next,
                    style: tInter(fontSize: 14, fontWeight: FontWeight.w600, color: kCrmText),
                    decoration: InputDecoration(border: InputBorder.none, isDense: true,
                        contentPadding: EdgeInsets.zero, hintText: '—',
                        hintStyle: tInter(fontSize: 14, color: const Color(0xFF94A3B8)))))),
            _DelBtn(enabled: csoCtrls.length > 1,
                onTap: csoCtrls.length > 1 ? () => onRemove(ri) : null),
          ])),
      ]),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ÉTAPE 3 — Rapport Journalier de Mélange
// ─────────────────────────────────────────────────────────────────────────────
class _Step3 extends StatelessWidget {
  final TextEditingController rapDate, rapZone, rapOp, rapHD, rapHF;
  final List<_RapRowCtrls> rapCtrls;
  final VoidCallback onAdd;
  final void Function(int) onRemove;
  final double Function(String) groupTotal;
  final Map<String, TextEditingController> chuteCtrls;
  final VoidCallback onCellChanged;

  const _Step3({
    required this.rapDate, required this.rapZone, required this.rapOp,
    required this.rapHD, required this.rapHF,
    required this.rapCtrls, required this.onAdd, required this.onRemove,
    required this.groupTotal, required this.chuteCtrls, required this.onCellChanged,
  });

  InputDecoration _dec(BuildContext context, String label) => InputDecoration(
    labelText: AppLocalizations.of(context).translate(label), labelStyle: tInter(fontSize: 11, color: kCrmTextSub),
    filled: true, fillColor: kCrmBg,
    contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
    border:        OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: Color(0xFFE2E8F0))),
    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: Color(0xFFE2E8F0))),
    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: kMelangeColor, width: 1.5)),
  );

  @override
  Widget build(BuildContext context) {
    final totH  = groupTotal('h');
    final totA  = groupTotal('a');
    final totB  = groupTotal('b');
    final totC  = groupTotal('c');
    final totGC = groupTotal('gc');
    final totPC = groupTotal('pc');
    final totGl = totA + totB + totC + totGC + totPC;
    String fmt(double v) => v == 0 ? '—' : v.toStringAsFixed(2);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [

        // ── En-tête du rapport ──────────────────────────────────────────────
        _Card(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Container(width: 28, height: 28,
                decoration: BoxDecoration(color: kMelangeColor.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(8)),
                child: const Icon(Icons.receipt_long_outlined, size: 14, color: kMelangeColor)),
            const SizedBox(width: 8),
            Text(AppLocalizations.of(context).translate('Rapport Journalier de Mélange'),
                style: tInter(fontSize: 14, fontWeight: FontWeight.w900, color: kCrmText)),
          ]),
          const SizedBox(height: 14),
          Row(children: [
            Expanded(child: TextField(controller: rapDate, decoration: _dec(context, 'Date'),
                style: tInter(fontSize: 13, color: kCrmText))),
            const SizedBox(width: 8),
            Expanded(child: TextField(controller: rapZone, decoration: _dec(context, 'Zone (optionnel)'),
                style: tInter(fontSize: 13, color: kCrmText))),
            const SizedBox(width: 8),
            Expanded(child: TextField(controller: rapOp, decoration: _dec(context, 'Opérateur'),
                style: tInter(fontSize: 13, color: kCrmText))),
          ]),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(child: TextField(controller: rapHD, decoration: _dec(context, 'Heure début'),
                style: tInter(fontSize: 13, color: kCrmText))),
            const SizedBox(width: 8),
            Expanded(child: TextField(controller: rapHF, decoration: _dec(context, 'Heure fin'),
                style: tInter(fontSize: 13, color: kCrmText))),
            const Expanded(child: SizedBox()),
          ]),
        ])),
        const SizedBox(height: 16),

        // ── Tableau ─────────────────────────────────────────────────────────
        _Card(noPad: true, child: _RapportTable(
          rowCtrls: rapCtrls,
          onAdd: onAdd,
          onRemove: onRemove,
          onChanged: onCellChanged,
        )),
        const SizedBox(height: 16),

        // ── Totaux + Chute fibre ─────────────────────────────────────────────
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(child: _Card(child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(AppLocalizations.of(context).translate('Totaux'), style: tInter(fontSize: 13, fontWeight: FontWeight.w800, color: kCrmText)),
              const SizedBox(height: 10),
              _TotRow('TOTAL H',                   fmt(totH),  const Color(0xFF6366F1)),
              _TotRow('TOTAL A',                   fmt(totA),  const Color(0xFF3B82F6)),
              _TotRow('TOTAL B',                   fmt(totB),  const Color(0xFF8B5CF6)),
              _TotRow('TOTAL C',                   fmt(totC),  const Color(0xFFF59E0B)),
              _TotRow('TOTAL C Grande Cuillère',   fmt(totGC), const Color(0xFF06B6D4)),
              _TotRow('TOTAL D Petite Cuillère',   fmt(totPC), const Color(0xFF84CC16)),
              const Divider(height: 16, color: Color(0xFFE2E8F0)),
              _TotRow('T.GLOBAL DE MÉLANGE',       fmt(totGl), kMelangeColor, bold: true),
            ],
          ))),
          const SizedBox(width: 12),
          SizedBox(width: 180, child: _Card(child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(AppLocalizations.of(context).translate('N° chute fibre'), style: tInter(fontSize: 13, fontWeight: FontWeight.w800, color: kCrmText)),
              const SizedBox(height: 10),
              for (final l in _kLines) ...[
                _LabeledField(label: l, ctrl: chuteCtrls[l]!, numeric: true),
                if (l != _kLines.last) const SizedBox(height: 8),
              ],
            ],
          ))),
        ]),
        const SizedBox(height: 20),
      ]),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tableau Rapport Journalier — sticky N column + sticky 2-level header
// ─────────────────────────────────────────────────────────────────────────────
class _RapportTable extends StatefulWidget {
  final List<_RapRowCtrls> rowCtrls;
  final VoidCallback onAdd;
  final void Function(int) onRemove;
  final VoidCallback onChanged;

  const _RapportTable({
    required this.rowCtrls, required this.onAdd,
    required this.onRemove, required this.onChanged,
  });

  @override
  State<_RapportTable> createState() => _RapportTableState();
}

class _RapportTableState extends State<_RapportTable> {
  final _hBody = ScrollController();
  final _hHead = ScrollController();
  final _vBody = ScrollController();
  final _vN    = ScrollController();

  static const double _cW   = _kRapCW;
  static const double _nW   = _kRapNW;
  static const double _tabH = _kRapTH;
  static const double _hdrH = _kH1 + _kH2;
  static const double _bH   = _tabH - _hdrH;

  double get _scrollW => _kRapGroups.length * _kLines.length * _cW + _kDW;

  @override
  void initState() {
    super.initState();
    _hBody.addListener(_onHScroll);
    _vBody.addListener(_onVScroll);
  }

  void _onHScroll() {
    if (!_hHead.hasClients) return;
    if (!_hHead.position.hasContentDimensions) return;
    final max = _hHead.position.maxScrollExtent;
    if (max <= 0) return;
    _hHead.jumpTo(_hBody.offset.clamp(0.0, max));
  }

  void _onVScroll() {
    if (!_vN.hasClients) return;
    if (!_vN.position.hasContentDimensions) return;
    final max = _vN.position.maxScrollExtent;
    if (max <= 0) return;
    _vN.jumpTo(_vBody.offset.clamp(0.0, max));
  }

  @override
  void dispose() {
    _hBody.removeListener(_onHScroll);
    _vBody.removeListener(_onVScroll);
    _hBody.dispose(); _hHead.dispose();
    _vBody.dispose(); _vN.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final n    = widget.rowCtrls.length;
    final scrW = _scrollW;

    return SizedBox(
      height: _tabH,
      child: Column(children: [

        SizedBox(
          height: _hdrH,
          child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Container(
              width: _nW,
              decoration: const BoxDecoration(
                color: Color(0xFF334155),
                border: Border(right: _kBdr, bottom: _kBdr),
              ),
              child: Center(child: Text(AppLocalizations.of(context).translate('N'),
                  style: tInter(fontSize: 13, fontWeight: FontWeight.w900, color: Colors.white))),
            ),
            Expanded(child: SingleChildScrollView(
              controller: _hHead,
              scrollDirection: Axis.horizontal,
              physics: const NeverScrollableScrollPhysics(),
              child: SizedBox(
                width: scrW,
                child: Column(children: [
                  _buildHdr1(scrW),
                  _buildHdr2(scrW),
                ]),
              ),
            )),
          ]),
        ),

        SizedBox(
          height: _bH,
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [

            SizedBox(
              width: _nW,
              child: ListView.builder(
                controller: _vN,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: n,
                itemExtent: _kRH,
                itemBuilder: (_, i) => Container(
                  height: _kRH,
                  decoration: const BoxDecoration(
                    color: Color(0xFFF8FAFC),
                    border: Border(right: _kBdr, bottom: _kBdr),
                  ),
                  child: Center(child: Text('${i + 1}',
                      style: tInter(fontSize: 12, fontWeight: FontWeight.w800,
                          color: const Color(0xFF475569)))),
                ),
              ),
            ),

            Expanded(
              child: SingleChildScrollView(
                controller: _hBody,
                scrollDirection: Axis.horizontal,
                child: SizedBox(
                  width: scrW,
                  child: ListView.builder(
                    controller: _vBody,
                    itemCount: n,
                    itemExtent: _kRH,
                    itemBuilder: (_, i) => _buildDataRow(i),
                  ),
                ),
              ),
            ),
          ]),
        ),

        _AddBtn(label: '+ Ajouter une ligne', onTap: widget.onAdd),
      ]),
    );
  }

  Widget _buildHdr1(double totalW) {
    final double groupW = _kLines.length * _cW;
    return Row(children: [
      for (int gi = 0; gi < _kRapGroups.length; gi++)
        Container(
          width: groupW, height: _kH1,
          decoration: BoxDecoration(
            color: _groupColor(gi).withOpacity(0.10),
            border: Border(
              left: gi == 0 ? _kBdr : BorderSide.none,
              right: _kBdr, top: _kBdr, bottom: _kBdr,
            ),
          ),
          child: Center(child: Text(AppLocalizations.of(context).translate(_kRapGroups[gi].$2), textAlign: TextAlign.center,
              style: tInter(fontSize: 10, fontWeight: FontWeight.w900,
                  color: _groupColor(gi)))),
        ),
      Container(width: _kDW, height: _kH1,
          decoration: const BoxDecoration(color: Color(0xFFF1F5F9),
              border: Border(right: _kBdr, top: _kBdr, bottom: _kBdr))),
    ]);
  }

  Widget _buildHdr2(double totalW) {
    return Row(children: [
      for (int gi = 0; gi < _kRapGroups.length; gi++)
        for (int li = 0; li < _kLines.length; li++)
          Container(
            width: _cW, height: _kH2,
            decoration: BoxDecoration(
              color: _groupColor(gi).withOpacity(0.04),
              border: Border(
                left: gi == 0 && li == 0 ? _kBdr : BorderSide.none,
                right: _kBdr, bottom: _kBdr,
              ),
            ),
            child: Center(child: Text(_kLines[li],
                style: tInter(fontSize: 10, fontWeight: FontWeight.w700,
                    color: _groupColor(gi).withOpacity(0.8)))),
          ),
      Container(width: _kDW, height: _kH2,
          decoration: const BoxDecoration(
              color: Color(0xFFF8FAFC),
              border: Border(right: _kBdr, bottom: _kBdr))),
    ]);
  }

  Widget _buildDataRow(int ri) {
    final rowCtrls = widget.rowCtrls[ri];
    final cells = <Widget>[];
    for (int gi = 0; gi < _kRapGroups.length; gi++) {
      final g = _kRapGroups[gi].$1;
      for (int li = 0; li < _kLines.length; li++) {
        final l = _kLines[li];
        cells.add(Container(
          width: _cW, height: _kRH,
          decoration: BoxDecoration(
            border: Border(
              left: gi == 0 && li == 0 ? _kBdr : BorderSide.none,
              right: _kBdr, bottom: _kBdr,
            ),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 3),
          child: Center(child: TextField(
            controller: rowCtrls.cells['${g}_$l'],
            onChanged: (_) => widget.onChanged(),
            textAlign: TextAlign.center,
            textInputAction: TextInputAction.next,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
            style: tInter(fontSize: 12, fontWeight: FontWeight.w600, color: kCrmText),
            decoration: InputDecoration(
              border: InputBorder.none, isDense: true, contentPadding: EdgeInsets.zero,
              hintText: '0',
              hintStyle: tInter(fontSize: 12, color: const Color(0xFFCBD5E1)),
            ),
          )),
        ));
      }
    }
    cells.add(_DelBtn(
      enabled: widget.rowCtrls.length > 1,
      onTap: widget.rowCtrls.length > 1
          ? () { widget.onRemove(ri); setState(() {}); }
          : null,
    ));
    return SizedBox(height: _kRH, child: Row(children: cells));
  }

  Color _groupColor(int gi) => const [
    Color(0xFF6366F1),
    Color(0xFF3B82F6),
    Color(0xFF10B981),
    Color(0xFFF59E0B),
    Color(0xFF06B6D4),
    Color(0xFFEC4899),
  ][gi];
}

// ─────────────────────────────────────────────────────────────────────────────
// Reusable small widgets
// ─────────────────────────────────────────────────────────────────────────────
class _TotRow extends StatelessWidget {
  final String label, value;
  final Color color;
  final bool bold;
  const _TotRow(this.label, this.value, this.color, {this.bold = false});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(children: [
        Container(width: 5, height: 5, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
        const SizedBox(width: 8),
        Expanded(child: Text(AppLocalizations.of(context).translate(label), style: tInter(fontSize: 12,
            fontWeight: bold ? FontWeight.w800 : FontWeight.w500, color: kCrmText))),
        Text(value, style: tInter(fontSize: 13,
            fontWeight: bold ? FontWeight.w900 : FontWeight.w700, color: color)),
      ]),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final IconData icon;
  final String title;
  const _SectionTitle({required this.icon, required this.title});

  @override
  Widget build(BuildContext context) {
    return Row(children: [
      Container(width: 30, height: 30,
          decoration: BoxDecoration(color: kMelangeColor.withOpacity(0.12),
              borderRadius: BorderRadius.circular(8)),
          child: Icon(icon, size: 15, color: kMelangeColor)),
      const SizedBox(width: 10),
      Text(AppLocalizations.of(context).translate(title), style: tInter(fontSize: 15, fontWeight: FontWeight.w800, color: kCrmText)),
    ]);
  }
}

class _Card extends StatelessWidget {
  final Widget child;
  final bool noPad;
  const _Card({required this.child, this.noPad = false});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: noPad ? EdgeInsets.zero : const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: kCrmSurface, borderRadius: BorderRadius.circular(14),
        border: Border.all(color: kCrmBorder),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0,3))],
      ),
      child: child,
    );
  }
}

class _AddBtn extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  const _AddBtn({required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 4, 12, 10),
      child: SizedBox(width: double.infinity, height: 42,
          child: OutlinedButton.icon(onPressed: onTap,
              icon: const Icon(Icons.add_rounded, size: 17),
              label: Text(AppLocalizations.of(context).translate(label), style: tInter(fontSize: 13, fontWeight: FontWeight.w700)),
              style: OutlinedButton.styleFrom(foregroundColor: kMelangeColor,
                  side: BorderSide(color: kMelangeColor.withOpacity(0.5)),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10))))),
    );
  }
}

class _LabeledField extends StatelessWidget {
  final String label;
  final TextEditingController ctrl;
  final int maxLines;
  final bool numeric;
  const _LabeledField({required this.label, required this.ctrl,
      this.maxLines = 1, this.numeric = false});

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(AppLocalizations.of(context).translate(label), style: tInter(fontSize: 12, fontWeight: FontWeight.w700, color: kCrmTextSub)),
      const SizedBox(height: 6),
      TextField(
        controller: ctrl, maxLines: maxLines,
        keyboardType: numeric ? const TextInputType.numberWithOptions(decimal: true) : TextInputType.text,
        inputFormatters: numeric ? [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))] : null,
        textInputAction: TextInputAction.next,
        style: tInter(fontSize: 14, color: kCrmText),
        decoration: InputDecoration(filled: true, fillColor: kCrmBg,
            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            border:        OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: Color(0xFFE2E8F0))),
            enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: Color(0xFFE2E8F0))),
            focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: kMelangeColor, width: 1.5))),
      ),
    ]);
  }
}

// ── Delete button ─────────────────────────────────────────────────────────────
class _DelBtn extends StatelessWidget {
  final bool enabled;
  final VoidCallback? onTap;
  const _DelBtn({required this.enabled, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return SizedBox(width: _kDW, height: _kRH,
        child: Center(child: InkWell(onTap: onTap, borderRadius: BorderRadius.circular(6),
            child: Padding(padding: const EdgeInsets.all(6),
                child: Icon(Icons.remove_circle_outline_rounded, size: 16,
                    color: enabled ? kCrmDanger : const Color(0xFFE2E8F0))))));
  }
}
