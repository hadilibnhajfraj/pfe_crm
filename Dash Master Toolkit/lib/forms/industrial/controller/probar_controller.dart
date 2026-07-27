// lib/forms/industrial/controller/probar_controller.dart
//
// GetX controller pour le parcours opérateur PROBAR — architecture identique
// à PorPromeshController mais utilise IndustrialRecordService / IndustrialRecordModel.
// Les données complexes (personnel, contrôle machine, contrôle qualité, process)
// sont sérialisées en JSON dans le champ `observations` de IndustrialRecordModel.

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';

import 'package:dash_master_toolkit/utils/common.dart';

import '../model/industrial_record_model.dart';
import '../service/industrial_record_service.dart';

class ProbarController extends GetxController {
  final RxBool isLoading = false.obs;
  final RxBool isLocked = false.obs;
  final RxString statut = 'enregistree'.obs;
  String? recordId;

  // Horodatage de la dernière sauvegarde de LA FICHE (pas de granularité
  // par module côté backend — un seul enregistrement partagé par tous les
  // écrans-module) — affiché tel quel comme "dernière modification" sur
  // chaque carte de ProbarModulesGridScreen.
  final Rxn<DateTime> lastUpdatedAt = Rxn<DateTime>();

  final RxnString machine = RxnString();
  final RxnString poste = RxnString();

  String? _bootstrappedKey;

  void setMachinePoste({String? machine, String? poste}) {
    if (machine != null && machine.isNotEmpty) this.machine.value = machine;
    if (poste != null && poste.isNotEmpty) this.poste.value = poste;
  }

  bool isBootstrappedFor(String machineNum, String posteValue) {
    final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
    return _bootstrappedKey == '$machineNum|$posteValue|$today';
  }

  // ── Informations générales ─────────────────────────────────────────────
  final dateProduction = TextEditingController();
  final Rxn<DateTime> selectedDateProduction = Rxn<DateTime>();
  final heureDebut = TextEditingController();
  final Rxn<TimeOfDay> selectedHeureDebut = Rxn<TimeOfDay>();
  final heureFin = TextEditingController();
  final Rxn<TimeOfDay> selectedHeureFin = Rxn<TimeOfDay>();
  final operateur = TextEditingController();

  // ── Module Rendement ───────────────────────────────────────────────────
  final productionM2 = TextEditingController();

  // ── Module Personnel ───────────────────────────────────────────────────
  final responsable1 = TextEditingController();
  final responsable2 = TextEditingController();
  final operateur1 = TextEditingController();
  final operateur2 = TextEditingController();
  final aideOperateur = TextEditingController();
  final manoeuvre = TextEditingController();
  final stagiaire1 = TextEditingController();
  final stagiaire2 = TextEditingController();

  // ── Module Observation ─────────────────────────────────────────────────
  final observationsGenerales = TextEditingController();

  // ── Module N/C ─────────────────────────────────────────────────────────
  final RxnString conformite = RxnString();
  final descriptionNonConformite = TextEditingController();
  final actionsCorrectives = TextEditingController();

  // ── Module Contrôle Machine ────────────────────────────────────────────
  // "bainResine" n'est plus affiché (carte "Bain Résine" supprimée,
  // remplacée par "FOUR" à l'écran) — conservé ici uniquement pour ne pas
  // perdre la valeur des fiches existantes.
  final RxnString bainResine = RxnString();
  final RxnString air = RxnString();
  final RxnString niveauBainEau = RxnString();
  final temperatureEau = TextEditingController();
  // "temperatureDemandee" n'est plus affiché (champ supprimé) — conservé
  // uniquement pour ne pas perdre la valeur des fiches existantes.
  final temperatureDemandee = TextEditingController();
  final RxnString etatPistons = RxnString();
  // "fluideVisuel" : donnée inchangée, seul le libellé affiché devient
  // "Fuite Visuelle" (au lieu de "Fluide Visuel").
  final RxnString fluideVisuel = RxnString();
  final RxnString etatDisqueCoupe = RxnString();
  // "etatAtelier"/"zoneStockage" ne sont plus affichés (cartes "État
  // Atelier"/"Zone Stockage" supprimées) — conservés uniquement pour ne pas
  // perdre la valeur des fiches existantes qui en avaient une.
  final RxnString etatAtelier = RxnString();
  final RxnString zoneStockage = RxnString();
  final justificationControleMachine = TextEditingController();

  // ── Module Contrôle Machine — Sous-écran Qualité mesures ─────────────────
  // "qmL{n}Hauteur" contient désormais l'HEURE de contrôle (texte "HH:mm",
  // saisi via un sélecteur d'heure) — champ renommé côté UI ("Heure") mais
  // contrôleur/clé de sérialisation ('l{n}h') inchangés pour rester
  // compatible avec les fiches existantes. "qmL{n}Largeur"/"qmL{n}Maille"
  // sont de même réutilisés tels quels pour "Longueur (mm)"/"Grammage
  // (g/m²)" (même donnée texte libre, seul le libellé change).
  final qmL1Hauteur = TextEditingController();
  final qmL1Largeur = TextEditingController();
  final qmL1Maille = TextEditingController();
  final qmL1Diametre = TextEditingController();
  final qmL2Hauteur = TextEditingController();
  final qmL2Largeur = TextEditingController();
  final qmL2Maille = TextEditingController();
  final qmL2Diametre = TextEditingController();
  final qmL3Hauteur = TextEditingController();
  final qmL3Largeur = TextEditingController();
  final qmL3Maille = TextEditingController();
  final qmL3Diametre = TextEditingController();
  final qmL4Hauteur = TextEditingController();
  final qmL4Largeur = TextEditingController();
  final qmL4Maille = TextEditingController();
  final qmL4Diametre = TextEditingController();
  final qmTemperature = TextEditingController();

  // Sélecteur d'heure générique pour le champ "Heure" de Qualité Mesures —
  // écrit "HH:mm" dans le TextEditingController ciblé (même format que
  // formatTime24h utilisé par heureDebut/heureFin).
  Future<void> pickQmHeure(BuildContext context, TextEditingController target) async {
    final picked = await showTimePicker(context: context, initialTime: _parseHHmm(target.text) ?? TimeOfDay.now());
    if (picked == null) return;
    target.text = formatTime24h(picked);
  }

  TimeOfDay? _parseHHmm(String text) {
    final parts = text.trim().split(':');
    if (parts.length != 2) return null;
    final h = int.tryParse(parts[0]);
    final m = int.tryParse(parts[1]);
    if (h == null || m == null || h < 0 || h > 23 || m < 0 || m > 59) return null;
    return TimeOfDay(hour: h, minute: m);
  }

  // ── Module Contrôle Machine — État Machine (champs supplémentaires) ──────
  final RxnString bobine = RxnString();
  final RxnString resistance = RxnString();
  // "four" (OK/NOK) n'est plus affiché (remplacé à l'écran par la carte
  // "FOUR" à 3 zones ci-dessous) — conservé dans le contrôleur uniquement
  // pour ne pas perdre la valeur des fiches existantes qui en avaient une.
  final RxnString four = RxnString();
  final RxnString bainEauFiltre = RxnString();
  final RxnString machineCeinture = RxnString();
  final RxnString machineBobinage = RxnString();

  // Nouvelle carte "FOUR" (remplace l'ancienne case OK/NOK à l'écran) — 3
  // zones de température.
  final fourZone1 = TextEditingController();
  final fourZone2 = TextEditingController();
  final fourZone3 = TextEditingController();

  // Nouvelle carte "Nombre des bobines" (saisie entière).
  final nombreBobines = TextEditingController();

  // Mapping Machine → Ligne (identique à _lineIndexForMachine utilisé par
  // probar_controle_machine_screen.dart / probar_controle_qualite_screen.dart) :
  // Machine 1→L1, 2→L2, 3→L3, 4→L4. Sert à ne valider que les données de LA
  // ligne réellement affichée/éditable pour cette fiche (jamais les 3 autres).
  int get _lineIndexForMachine => ((int.tryParse(machine.value ?? '') ?? 1) - 1).clamp(0, 3);

  TextEditingController get _qmHeureCurrentLine => switch (_lineIndexForMachine) {
        0 => qmL1Hauteur, 1 => qmL2Hauteur, 2 => qmL3Hauteur, _ => qmL4Hauteur,
      };
  TextEditingController get _qmLongueurCurrentLine => switch (_lineIndexForMachine) {
        0 => qmL1Largeur, 1 => qmL2Largeur, 2 => qmL3Largeur, _ => qmL4Largeur,
      };
  TextEditingController get _qmGrammageCurrentLine => switch (_lineIndexForMachine) {
        0 => qmL1Maille, 1 => qmL2Maille, 2 => qmL3Maille, _ => qmL4Maille,
      };
  TextEditingController get _qmDiametreCurrentLine => switch (_lineIndexForMachine) {
        0 => qmL1Diametre, 1 => qmL2Diametre, 2 => qmL3Diametre, _ => qmL4Diametre,
      };

  static const double machineTemperatureEauMin = 40.0;
  static const double machineTemperatureEauMax = 60.0;

  bool get controleMachineTemperatureEauOutOfRange {
    final v = double.tryParse(temperatureEau.text.replaceAll(',', '.'));
    if (v == null) return false;
    return v < machineTemperatureEauMin || v > machineTemperatureEauMax;
  }

  bool get controleMachineHasNegative =>
      (bainResine.value != null && bainResine.value != 'Moyen') ||
      air.value == '< 6 bars' ||
      niveauBainEau.value == 'Mauvais' ||
      controleMachineTemperatureEauOutOfRange ||
      etatPistons.value == 'Sale' ||
      fluideVisuel.value == 'Présence' ||
      etatDisqueCoupe.value == 'NOK' ||
      etatAtelier.value == 'Sale' ||
      zoneStockage.value == 'NOK' ||
      bobine.value == 'NOK' ||
      resistance.value == 'NOK' ||
      four.value == 'NOK' ||
      bainEauFiltre.value == 'NOK' ||
      machineCeinture.value == 'NOK' ||
      machineBobinage.value == 'NOK';

  /// Contrôle Machine — Module 5 : "Complété" uniquement si TOUS les champs
  /// actuellement affichés à l'écran (Mesures qualité de la ligne de cette
  /// machine + État machine) sont renseignés — jamais simplement parce
  /// qu'une fiche existe en base. "Justification / Observations" reste un
  /// commentaire libre, non obligatoire (aucune contrainte visuelle du
  /// formulaire n'en fait un champ requis).
  bool isControleMachineComplete() {
    final requiredText = <TextEditingController>[
      _qmHeureCurrentLine, _qmLongueurCurrentLine, _qmGrammageCurrentLine, _qmDiametreCurrentLine,
      qmTemperature,
      fourZone1, fourZone2, fourZone3,
      temperatureEau,
      nombreBobines,
    ];
    if (requiredText.any((c) => c.text.trim().isEmpty)) return false;

    final requiredChoice = <RxnString>[
      air, niveauBainEau, bobine, resistance, bainEauFiltre,
      machineCeinture, machineBobinage, etatPistons, fluideVisuel, etatDisqueCoupe,
    ];
    if (requiredChoice.any((v) => v.value == null)) return false;

    return true;
  }

  bool get controleMachineSaved => isControleMachineComplete();

  // ── Module Contrôle Qualité ────────────────────────────────────────────
  final RxList<Map<String, dynamic>> controlesQualite = <Map<String, dynamic>>[].obs;
  final note = TextEditingController();
  final signatureChefEquipe = TextEditingController();
  final justificationControleProcess = TextEditingController();

  // ── Ancien module "Contrôle Process" — supprimé de l'interface ──────────
  // Le module PROBAR n'a plus de section Contrôle Process (aucun widget,
  // aucune carte). `_processControlRaw` conserve tel quel (sans le
  // décoder/l'afficher) le contenu `pc` d'une fiche existante qui en aurait
  // un, uniquement pour ne pas l'effacer lors du prochain enregistrement
  // (`description` remplace tout le JSON à chaque sauvegarde) — ce n'est
  // pas une référence UI, juste une préservation silencieuse de donnée.
  Map<String, dynamic> _processControlRaw = {};

  // ── Complétude des sections ────────────────────────────────────────────
  bool get rendementSaved => productionM2.text.trim().isNotEmpty;

  bool get personnelSaved => [
        responsable1,
        responsable2,
        operateur1,
        operateur2,
        aideOperateur,
        manoeuvre,
        stagiaire1,
        stagiaire2,
      ].any((c) => c.text.trim().isNotEmpty);

  bool get observationSaved => observationsGenerales.text.trim().isNotEmpty;

  bool get nonConformiteSaved {
    final v = conformite.value;
    if (v == null) return false;
    if (v == 'non_conforme') return descriptionNonConformite.text.trim().isNotEmpty;
    return true;
  }

  // Clés numériques affichées dans l'écran Contrôle Qualité — le module est
  // considéré terminé si toutes ces données + statutCOQ sont renseignées pour
  // la seule ligne de la machine de cette fiche (voir isControleQualiteComplete).
  static const _kQualiteNumericFields = [
    'nbBobines', 'vitesse', 'mesure', 'diametre',
    'poids', 'longueurBarre', 'longueurDechet',
  ];

  // Labels lisibles utilisés dans le diagnostic de validation
  static const _kQualiteFieldLabels = <String, String>{
    'nbBobines':      'Nombre de bobines',
    'vitesse':        'Vitesse machine',
    'mesure':         'Mesure (m/min)',
    'diametre':       'Diamètre',
    'poids':          'Poids 1 mètre',
    'longueurBarre':  'Longueur de barre',
    'longueurDechet': 'Longueur de déchet',
  };

  /// Contrôle Qualité — Module 6 : "Complété" uniquement si Statut COQ + les
  /// 7 champs numériques sont renseignés pour LA SEULE ligne affichée à
  /// l'écran (celle de la machine de cette fiche — voir _lineIndexForMachine
  /// ci-dessus, même mapping que probar_controle_qualite_screen.dart).
  /// Une ligne jamais visitée (aucune entrée dans controlesQualite) est
  /// explicitement incomplète — l'existence d'un enregistrement en base
  /// n'est jamais suffisante à elle seule.
  bool isControleQualiteComplete() {
    final i = _lineIndexForMachine;
    if (i >= controlesQualite.length) return false;
    final slot = controlesQualite[i];
    if ((slot['statutCOQ'] as String?) == null) return false;
    return _kQualiteNumericFields.every((k) => (slot[k] as String?)?.trim().isNotEmpty ?? false);
  }

  bool get controleProduitSaved => isControleQualiteComplete();

  bool isQualiteComplete() => isControleQualiteComplete();

  bool isProcessComplete() => true;

  bool isParametresPosteComplete() => true;
  bool isObservationComplete() => observationSaved;
  bool isNonConformiteComplete() => nonConformiteSaved;

  bool get canFinish =>
      rendementSaved &&
      personnelSaved &&
      controleMachineSaved &&
      isQualiteComplete() &&
      isParametresPosteComplete() &&
      isObservationComplete() &&
      isNonConformiteComplete();

  // ── Diagnostic de validation ───────────────────────────────────────────

  /// Champs manquants pour un créneau Qualité donné (index 0‑3). Liste vide
  /// = créneau complet. Une ligne jamais visitée (absente de
  /// controlesQualite) liste TOUS les champs comme manquants — ne doit
  /// jamais être confondue avec "complet".
  List<String> qualiteSlotErrors(int slotIndex) {
    final slot = slotIndex < controlesQualite.length
        ? controlesQualite[slotIndex]
        : const <String, dynamic>{};
    final errors = <String>[];
    if ((slot['statutCOQ'] as String?) == null) errors.add('Statut COQ manquant');
    for (final e in _kQualiteFieldLabels.entries) {
      if ((slot[e.key] as String?)?.trim().isEmpty ?? true) {
        errors.add('${e.value} manquant');
      }
    }
    return errors;
  }

  List<String> processMissingParams() => [];

  List<(String, List<String>)> processParamDiagnostic() => [];

  List<String> getValidationErrors() {
    final errors = <String>[];
    if (!rendementSaved) errors.add('Rendement — Production M² manquante');
    if (!personnelSaved) errors.add('Personnel — Au moins un agent doit être renseigné');
    if (!isControleMachineComplete()) errors.add('Contrôle Machine — Champs manquants');
    const slots = ['L1', 'L2', 'L3', 'L4'];
    final qualiteLine = _lineIndexForMachine;
    for (final msg in qualiteSlotErrors(qualiteLine)) {
      errors.add('Qualité ${slots[qualiteLine]} — $msg');
    }
    if (!isObservationComplete()) {
      errors.add('Observations — Commentaire manquant');
    }
    if (!isNonConformiteComplete()) {
      errors.add(conformite.value == null
          ? 'Non-Conformité — Statut manquant'
          : 'Non-Conformité — Description manquante (produit non conforme)');
    }
    return errors;
  }

  // ── Bootstrap ──────────────────────────────────────────────────────────
  Future<void> bootstrapForMachinePoste(
    String machineNum,
    String posteValue, {
    bool forceRefresh = false,
  }) async {
    final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
    final key = '$machineNum|$posteValue|$today';
    if (!forceRefresh && key == _bootstrappedKey) return;

    isLoading.value = true;
    try {
      final existing = await IndustrialRecordService.instance.fetchAll(
        module: 'probar',
        machine: machineNum,
        poste: posteValue,
        forceRefresh: forceRefresh,
      );
      // "Nouvelle fiche" ne doit reprendre qu'un BROUILLON existant du jour,
      // jamais une fiche déjà "validee" (verrouillée) : une fiche verrouillée
      // ferait échouer le chargement dans ProbarModulesGridScreen (isLocked
      // == true → redirection immédiate et silencieuse vers le dashboard,
      // la grille des modules n'apparaît alors jamais). Si la seule fiche du
      // jour est déjà validée, on en crée une nouvelle (comportement attendu
      // du bouton "Nouvelle fiche").
      final todayDrafts =
          existing.where((r) => r.dateFiche == today && r.statut != 'validee').toList();
      if (todayDrafts.isNotEmpty) {
        resetForm();
        loadFromModel(todayDrafts.first);
      } else {
        resetForm();
        setMachinePoste(machine: machineNum, poste: posteValue);
        dateProduction.text = today;
      }
      _bootstrappedKey = key;
    } finally {
      isLoading.value = false;
    }
  }

  Future<void> bootstrapWithId(String machineNum, String posteValue, String id) async {
    if (recordId == id) return;
    isLoading.value = true;
    try {
      final model = await IndustrialRecordService.instance.fetchById(id);
      resetForm();
      loadFromModel(model);
      final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
      _bootstrappedKey = '$machineNum|$posteValue|$today';
    } finally {
      isLoading.value = false;
    }
  }

  Future<void> loadById(String id) async {
    isLoading.value = true;
    try {
      final m = await IndustrialRecordService.instance.fetchById(id);
      loadFromModel(m);
    } finally {
      isLoading.value = false;
    }
  }

  // ── Date / Time pickers ────────────────────────────────────────────────
  Future<void> pickDateProduction(BuildContext context) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: selectedDateProduction.value ?? DateTime.now(),
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (picked == null) return;
    selectedDateProduction.value = picked;
    dateProduction.text = DateFormat('yyyy-MM-dd').format(picked);
  }

  Future<TimeOfDay?> _pickTime(BuildContext context, TimeOfDay? initial) =>
      showTimePicker(context: context, initialTime: initial ?? TimeOfDay.now());

  Future<void> pickHeureDebut(BuildContext context) async {
    final picked = await _pickTime(context, selectedHeureDebut.value);
    if (picked == null) return;
    selectedHeureDebut.value = picked;
    heureDebut.text = formatTime24h(picked);
  }

  Future<void> pickHeureFin(BuildContext context) async {
    final picked = await _pickTime(context, selectedHeureFin.value);
    if (picked == null) return;
    selectedHeureFin.value = picked;
    heureFin.text = formatTime24h(picked);
  }

  // ── Reset ──────────────────────────────────────────────────────────────
  void resetForm() {
    recordId = null;
    statut.value = 'enregistree';
    isLocked.value = false;
    lastUpdatedAt.value = null;
    machine.value = null;
    poste.value = null;
    dateProduction.clear();
    selectedDateProduction.value = null;
    heureDebut.clear();
    selectedHeureDebut.value = null;
    heureFin.clear();
    selectedHeureFin.value = null;
    operateur.clear();
    productionM2.clear();
    responsable1.clear();
    responsable2.clear();
    operateur1.clear();
    operateur2.clear();
    aideOperateur.clear();
    manoeuvre.clear();
    stagiaire1.clear();
    stagiaire2.clear();
    observationsGenerales.clear();
    conformite.value = null;
    descriptionNonConformite.clear();
    actionsCorrectives.clear();
    bainResine.value = null;
    air.value = null;
    niveauBainEau.value = null;
    temperatureEau.clear();
    temperatureDemandee.clear();
    etatPistons.value = null;
    fluideVisuel.value = null;
    etatDisqueCoupe.value = null;
    etatAtelier.value = null;
    zoneStockage.value = null;
    justificationControleMachine.clear();
    qmL1Hauteur.clear(); qmL1Largeur.clear(); qmL1Maille.clear(); qmL1Diametre.clear();
    qmL2Hauteur.clear(); qmL2Largeur.clear(); qmL2Maille.clear(); qmL2Diametre.clear();
    qmL3Hauteur.clear(); qmL3Largeur.clear(); qmL3Maille.clear(); qmL3Diametre.clear();
    qmL4Hauteur.clear(); qmL4Largeur.clear(); qmL4Maille.clear(); qmL4Diametre.clear();
    qmTemperature.clear();
    bobine.value = null;
    resistance.value = null;
    four.value = null;
    fourZone1.clear();
    fourZone2.clear();
    fourZone3.clear();
    nombreBobines.clear();
    bainEauFiltre.value = null;
    machineCeinture.value = null;
    machineBobinage.value = null;
    controlesQualite.clear();
    note.clear();
    signatureChefEquipe.clear();
    justificationControleProcess.clear();
    _processControlRaw = {};
  }

  // ── Load depuis IndustrialRecordModel ─────────────────────────────────
  //
  // Nouveau format : observations = texte libre, description = JSON compact.
  // Ancien format (legacy) : observations contenait le JSON complet.
  //   → On détecte et migre automatiquement à la lecture.
  void loadFromModel(IndustrialRecordModel m) {
    recordId = m.id;
    statut.value = m.statut;
    isLocked.value = m.statut == 'validee';
    lastUpdatedAt.value = DateTime.tryParse(m.updatedAt ?? '');
    machine.value = m.machine;
    poste.value = m.poste;
    dateProduction.text = m.dateFiche ?? '';
    selectedDateProduction.value = DateTime.tryParse(m.dateFiche ?? '');
    operateur.text = m.operateur ?? '';
    productionM2.text = m.quantiteProduite?.toString() ?? '';

    conformite.value = m.statutQualite == 'ok'
        ? 'conforme'
        : m.statutQualite == 'nok'
            ? 'non_conforme'
            : null;

    // ── Nouveau format : description = JSON compact des modules ────────
    final rawDesc = (m.description ?? '').trim();
    if (rawDesc.startsWith('{')) {
      try {
        final desc = jsonDecode(rawDesc) as Map<String, dynamic>;
        observationsGenerales.text = m.observations ?? ''; // texte brut
        _loadComplexFromCompactJson(desc);
        return;
      } catch (_) {}
    }

    // ── Legacy : observations contenait le JSON complet ────────────────
    final rawObs = (m.observations ?? '').trim();
    if (rawObs.startsWith('{')) {
      try {
        final obs = jsonDecode(rawObs) as Map<String, dynamic>;
        _loadFromLegacyJson(obs);
        return;
      } catch (_) {}
    }

    // ── Texte brut (pas de JSON) ───────────────────────────────────────
    observationsGenerales.text = m.observations ?? '';
  }

  // Lecture du nouveau format compact (clés courtes, processControl indexé).
  void _loadComplexFromCompactJson(Map<String, dynamic> d) {
    heureDebut.text = d['hd']?.toString() ?? '';
    heureFin.text = d['hf']?.toString() ?? '';

    final p = (d['p'] as Map?)?.cast<String, dynamic>() ?? {};
    responsable1.text = p['r1']?.toString() ?? '';
    responsable2.text = p['r2']?.toString() ?? '';
    operateur1.text = p['o1']?.toString() ?? '';
    operateur2.text = p['o2']?.toString() ?? '';
    aideOperateur.text = p['ao']?.toString() ?? '';
    manoeuvre.text = p['mn']?.toString() ?? '';
    stagiaire1.text = p['s1']?.toString() ?? '';
    stagiaire2.text = p['s2']?.toString() ?? '';

    descriptionNonConformite.text = d['dnc']?.toString() ?? '';
    actionsCorrectives.text = d['ac']?.toString() ?? '';

    final cm = (d['cm'] as Map?)?.cast<String, dynamic>() ?? {};
    bainResine.value = cm['br']?.toString();
    air.value = cm['ai']?.toString();
    if (air.value == '≥ 6 bars') air.value = '>= 6 bars';
    niveauBainEau.value = cm['nb']?.toString();
    temperatureEau.text = cm['te']?.toString() ?? '';
    temperatureDemandee.text = cm['td']?.toString() ?? '';
    etatPistons.value = cm['ep']?.toString();
    fluideVisuel.value = cm['fv']?.toString();
    etatDisqueCoupe.value = cm['ed']?.toString();
    etatAtelier.value = cm['ea']?.toString();
    zoneStockage.value = cm['zs']?.toString();
    justificationControleMachine.text = cm['jm']?.toString() ?? '';
    bobine.value = cm['bo']?.toString();
    resistance.value = cm['rs']?.toString();
    four.value = cm['fo']?.toString();
    fourZone1.text = cm['z1']?.toString() ?? '';
    fourZone2.text = cm['z2']?.toString() ?? '';
    fourZone3.text = cm['z3']?.toString() ?? '';
    nombreBobines.text = cm['nbb']?.toString() ?? '';
    bainEauFiltre.value = cm['bf']?.toString();
    machineCeinture.value = cm['mc']?.toString();
    machineBobinage.value = cm['mb']?.toString();

    final qm = (d['qm'] as Map?)?.cast<String, dynamic>() ?? {};
    qmL1Hauteur.text = qm['l1h']?.toString() ?? '';
    qmL1Largeur.text = qm['l1l']?.toString() ?? '';
    qmL1Maille.text = qm['l1m']?.toString() ?? '';
    qmL1Diametre.text = qm['l1d']?.toString() ?? '';
    qmL2Hauteur.text = qm['l2h']?.toString() ?? '';
    qmL2Largeur.text = qm['l2l']?.toString() ?? '';
    qmL2Maille.text = qm['l2m']?.toString() ?? '';
    qmL2Diametre.text = qm['l2d']?.toString() ?? '';
    qmL3Hauteur.text = qm['l3h']?.toString() ?? '';
    qmL3Largeur.text = qm['l3l']?.toString() ?? '';
    qmL3Maille.text = qm['l3m']?.toString() ?? '';
    qmL3Diametre.text = qm['l3d']?.toString() ?? '';
    qmL4Hauteur.text = qm['l4h']?.toString() ?? '';
    qmL4Largeur.text = qm['l4l']?.toString() ?? '';
    qmL4Maille.text = qm['l4m']?.toString() ?? '';
    qmL4Diametre.text = qm['l4d']?.toString() ?? '';
    qmTemperature.text = qm['tp']?.toString() ?? '';

    final cq = (d['cq'] as List?) ?? [];
    controlesQualite.assignAll(cq.whereType<Map>().map((e) => Map<String, dynamic>.from(e)));
    note.text = d['n']?.toString() ?? '';
    signatureChefEquipe.text = d['sig']?.toString() ?? '';
    justificationControleProcess.text = d['jp']?.toString() ?? '';

    // Contrôle Process supprimé de l'interface : on ne décode plus `pc` en
    // champs individuels, on le garde tel quel pour le réémettre inchangé
    // au prochain enregistrement (voir _processControlRaw ci-dessus).
    _processControlRaw = (d['pc'] as Map?)?.cast<String, dynamic>() ?? {};
  }

  // Lecture de l'ancien format verbeux (stocké dans observations).
  // Conservé uniquement pour la rétrocompatibilité avec les fiches existantes.
  void _loadFromLegacyJson(Map<String, dynamic> obs) {
    observationsGenerales.text = obs['texte']?.toString() ?? '';
    heureDebut.text = obs['heureDebut']?.toString() ?? '';
    heureFin.text = obs['heureFin']?.toString() ?? '';

    final personnel = (obs['personnel'] as Map?)?.cast<String, dynamic>() ?? {};
    responsable1.text = personnel['responsable1']?.toString() ?? '';
    responsable2.text = personnel['responsable2']?.toString() ?? '';
    operateur1.text = personnel['operateur1']?.toString() ?? '';
    operateur2.text = personnel['operateur2']?.toString() ?? '';
    aideOperateur.text = personnel['aideOperateur']?.toString() ?? '';
    manoeuvre.text = personnel['manoeuvre']?.toString() ?? '';
    stagiaire1.text = personnel['stagiaire1']?.toString() ?? '';
    stagiaire2.text = personnel['stagiaire2']?.toString() ?? '';

    descriptionNonConformite.text = obs['descriptionNonConformite']?.toString() ?? '';
    actionsCorrectives.text = obs['actionsCorrectives']?.toString() ?? '';

    final cm = (obs['controleMachine'] as Map?)?.cast<String, dynamic>() ?? {};
    bainResine.value = cm['bainResine']?.toString();
    air.value = cm['air']?.toString();
    if (air.value == '≥ 6 bars') air.value = '>= 6 bars';
    niveauBainEau.value = cm['niveauBainEau']?.toString();
    temperatureEau.text = cm['temperatureEau']?.toString() ?? '';
    temperatureDemandee.text = cm['temperatureDemandee']?.toString() ?? '';
    etatPistons.value = cm['etatPistons']?.toString();
    fluideVisuel.value = cm['fluideVisuel']?.toString();
    etatDisqueCoupe.value = cm['etatDisqueCoupe']?.toString();
    etatAtelier.value = cm['etatAtelier']?.toString();
    zoneStockage.value = cm['zoneStockage']?.toString();
    justificationControleMachine.text = cm['justificationControleMachine']?.toString() ?? '';

    final cq = (obs['controlesQualite'] as List?) ?? [];
    controlesQualite.assignAll(cq.whereType<Map>().map((e) => Map<String, dynamic>.from(e)));
    note.text = obs['note']?.toString() ?? '';
    signatureChefEquipe.text = obs['signatureChefEquipe']?.toString() ?? '';
    justificationControleProcess.text = obs['justificationControleProcess']?.toString() ?? '';

    // Contrôle Process supprimé de l'interface — l'ancien format verbeux
    // (`obs['processControl']`, une ligne par bloc/paramètre) n'est plus
    // reconstitué : ce chemin ne concerne que les toutes premières fiches
    // (format antérieur au format compact `pc`), aucune saisie n'y donne
    // plus accès de toute façon.
  }

  // ── Build IndustrialRecordModel ────────────────────────────────────────
  //
  // Séparation stricte des champs :
  //   • observations → UNIQUEMENT le commentaire libre de l'opérateur (≤5000 chars)
  //   • description  → JSON compact de toutes les données structurées des modules
  //                    (personnel, machine, qualité, process) — sans limite dure connue.
  IndustrialRecordModel buildModel({required String forStatut}) {
    return IndustrialRecordModel(
      id: recordId,
      module: 'probar',
      machine: machine.value,
      poste: poste.value,
      dateFiche: dateProduction.text.trim().isEmpty ? null : dateProduction.text.trim(),
      operateur: operateur.text.trim().isEmpty ? null : operateur.text.trim(),
      quantiteProduite: double.tryParse(productionM2.text.trim().replaceAll(',', '.')),
      statutQualite: conformite.value == 'conforme'
          ? 'ok'
          : conformite.value == 'non_conforme'
              ? 'nok'
              : null,
      observations: observationsGenerales.text.trim(), // texte utilisateur uniquement
      description: _buildComplexDataJson(),             // données modules structurées
      statut: forStatut,
    );
  }

  // JSON compact des données modules — séparé de observations pour respecter
  // la limite backend de 5000 chars sur observations.
  // Clés courtes pour minimiser la taille. Seuls les champs non-vides sont inclus.
  String _buildComplexDataJson() {
    final personnel = <String, String>{};
    void addP(String k, TextEditingController c) {
      final v = c.text.trim();
      if (v.isNotEmpty) personnel[k] = v;
    }
    addP('r1', responsable1);
    addP('r2', responsable2);
    addP('o1', operateur1);
    addP('o2', operateur2);
    addP('ao', aideOperateur);
    addP('mn', manoeuvre);
    addP('s1', stagiaire1);
    addP('s2', stagiaire2);

    final cm = <String, dynamic>{};
    if (bainResine.value != null) cm['br'] = bainResine.value;
    if (air.value != null) cm['ai'] = air.value;
    if (niveauBainEau.value != null) cm['nb'] = niveauBainEau.value;
    if (temperatureEau.text.trim().isNotEmpty) cm['te'] = temperatureEau.text.trim();
    if (temperatureDemandee.text.trim().isNotEmpty) cm['td'] = temperatureDemandee.text.trim();
    if (etatPistons.value != null) cm['ep'] = etatPistons.value;
    if (fluideVisuel.value != null) cm['fv'] = fluideVisuel.value;
    if (etatDisqueCoupe.value != null) cm['ed'] = etatDisqueCoupe.value;
    if (etatAtelier.value != null) cm['ea'] = etatAtelier.value;
    if (zoneStockage.value != null) cm['zs'] = zoneStockage.value;
    if (justificationControleMachine.text.trim().isNotEmpty) cm['jm'] = justificationControleMachine.text.trim();
    if (bobine.value != null) cm['bo'] = bobine.value;
    if (resistance.value != null) cm['rs'] = resistance.value;
    if (four.value != null) cm['fo'] = four.value;
    if (fourZone1.text.trim().isNotEmpty) cm['z1'] = fourZone1.text.trim();
    if (fourZone2.text.trim().isNotEmpty) cm['z2'] = fourZone2.text.trim();
    if (fourZone3.text.trim().isNotEmpty) cm['z3'] = fourZone3.text.trim();
    if (nombreBobines.text.trim().isNotEmpty) cm['nbb'] = nombreBobines.text.trim();
    if (bainEauFiltre.value != null) cm['bf'] = bainEauFiltre.value;
    if (machineCeinture.value != null) cm['mc'] = machineCeinture.value;
    if (machineBobinage.value != null) cm['mb'] = machineBobinage.value;

    final qm = <String, String>{};
    void addQ(String k, TextEditingController ctrl) {
      final v = ctrl.text.trim();
      if (v.isNotEmpty) qm[k] = v;
    }
    addQ('l1h', qmL1Hauteur); addQ('l1l', qmL1Largeur); addQ('l1m', qmL1Maille); addQ('l1d', qmL1Diametre);
    addQ('l2h', qmL2Hauteur); addQ('l2l', qmL2Largeur); addQ('l2m', qmL2Maille); addQ('l2d', qmL2Diametre);
    addQ('l3h', qmL3Hauteur); addQ('l3l', qmL3Largeur); addQ('l3m', qmL3Maille); addQ('l3d', qmL3Diametre);
    addQ('l4h', qmL4Hauteur); addQ('l4l', qmL4Largeur); addQ('l4m', qmL4Maille); addQ('l4d', qmL4Diametre);
    addQ('tp', qmTemperature);

    return jsonEncode({
      if (heureDebut.text.trim().isNotEmpty) 'hd': heureDebut.text.trim(),
      if (heureFin.text.trim().isNotEmpty) 'hf': heureFin.text.trim(),
      if (personnel.isNotEmpty) 'p': personnel,
      if (descriptionNonConformite.text.trim().isNotEmpty) 'dnc': descriptionNonConformite.text.trim(),
      if (actionsCorrectives.text.trim().isNotEmpty) 'ac': actionsCorrectives.text.trim(),
      if (cm.isNotEmpty) 'cm': cm,
      if (qm.isNotEmpty) 'qm': qm,
      if (controlesQualite.isNotEmpty) 'cq': controlesQualite.toList(),
      if (note.text.trim().isNotEmpty) 'n': note.text.trim(),
      if (signatureChefEquipe.text.trim().isNotEmpty) 'sig': signatureChefEquipe.text.trim(),
      // Contrôle Process retiré de l'interface — `_processControlRaw` est
      // réémis tel quel (jamais modifié, jamais affiché) pour ne pas
      // effacer l'historique d'une fiche qui en avait un.
      if (_processControlRaw.isNotEmpty) 'pc': _processControlRaw,
      if (justificationControleProcess.text.trim().isNotEmpty) 'jp': justificationControleProcess.text.trim(),
    });
  }

  // ── Sauvegarde / Validation ────────────────────────────────────────────
  Future<IndustrialRecordModel> saveDraft() async {
    final model = buildModel(forStatut: 'enregistree');
    final saved = recordId == null
        ? await IndustrialRecordService.instance.create(model)
        : await IndustrialRecordService.instance.update(recordId!, model);
    recordId = saved.id ?? recordId;
    statut.value = 'enregistree';
    isLocked.value = false;
    lastUpdatedAt.value = DateTime.tryParse(saved.updatedAt ?? '') ?? DateTime.now();
    return saved;
  }

  Future<IndustrialRecordModel> submit() async {
    await saveDraft();
    final model = buildModel(forStatut: 'validee');
    if (recordId == null) throw Exception('Impossible de valider : fiche introuvable.');
    final saved = await IndustrialRecordService.instance.update(recordId!, model);
    recordId = saved.id ?? recordId;
    statut.value = 'validee';
    isLocked.value = true;
    lastUpdatedAt.value = DateTime.tryParse(saved.updatedAt ?? '') ?? DateTime.now();
    return saved;
  }

  @override
  void onClose() {
    dateProduction.dispose();
    heureDebut.dispose();
    heureFin.dispose();
    operateur.dispose();
    productionM2.dispose();
    responsable1.dispose();
    responsable2.dispose();
    operateur1.dispose();
    operateur2.dispose();
    aideOperateur.dispose();
    manoeuvre.dispose();
    stagiaire1.dispose();
    stagiaire2.dispose();
    observationsGenerales.dispose();
    descriptionNonConformite.dispose();
    actionsCorrectives.dispose();
    temperatureEau.dispose();
    temperatureDemandee.dispose();
    justificationControleMachine.dispose();
    qmL1Hauteur.dispose(); qmL1Largeur.dispose(); qmL1Maille.dispose(); qmL1Diametre.dispose();
    qmL2Hauteur.dispose(); qmL2Largeur.dispose(); qmL2Maille.dispose(); qmL2Diametre.dispose();
    qmL3Hauteur.dispose(); qmL3Largeur.dispose(); qmL3Maille.dispose(); qmL3Diametre.dispose();
    qmL4Hauteur.dispose(); qmL4Largeur.dispose(); qmL4Maille.dispose(); qmL4Diametre.dispose();
    qmTemperature.dispose();
    fourZone1.dispose();
    fourZone2.dispose();
    fourZone3.dispose();
    nombreBobines.dispose();
    note.dispose();
    signatureChefEquipe.dispose();
    justificationControleProcess.dispose();
    super.onClose();
  }
}
