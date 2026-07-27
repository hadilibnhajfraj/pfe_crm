// lib/forms/por_promesh/controller/por_promesh_controller.dart
//
// GetX controller for the POR PROMESH wizard (3 steps) + CRUD glue.
// Follows the same conventions as ProjectFormController:
//   • TextEditingController per text/number field.
//   • Rxn<DateTime> / Rxn<TimeOfDay> kept in sync with their display
//     TextEditingController via pickDate/pickTime helpers.
//   • RxnString for fixed-choice dropdowns (step 2).
//   • RxList<Map<String,dynamic>> for the dynamic tables.

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';

import 'package:dash_master_toolkit/utils/common.dart';

import '../model/por_promesh_model.dart';
import '../service/por_promesh_service.dart';

class PorPromeshController extends GetxController {
  final formKey = GlobalKey<FormState>();

  final RxBool isSubmitting = false.obs;
  final RxBool isLoading = false.obs;
  final RxString status = 'draft'.obs;
  // Verrouillée dès le premier enregistrement côté backend — `false`
  // uniquement tant que la fiche n'a jamais été sauvegardée.
  final RxBool isLocked = false.obs;
  String? recordId;

  // Horodatage de la dernière sauvegarde de LA FICHE (pas de granularité
  // par module côté backend — un seul enregistrement partagé par tous les
  // écrans-module) — affiché tel quel comme "dernière modification" sur
  // chaque carte de ModulesGridScreen.
  final Rxn<DateTime> lastUpdatedAt = Rxn<DateTime>();

  // Machine PROMESH (1..4) / poste (matin/nuit) — préremplis depuis la page
  // Machine du module industriel (query params ?machine=&poste=) ou chargés
  // avec la fiche existante. Affichés en lecture seule dans le header.
  final RxnString machine = RxnString();
  final RxnString poste = RxnString();

  void setMachinePoste({String? machine, String? poste}) {
    if (machine != null && machine.isNotEmpty) this.machine.value = machine;
    if (poste != null && poste.isNotEmpty) this.poste.value = poste;
  }

  /// Clé (machine|poste|date) déjà chargée sur ce contrôleur permanent — évite
  /// de refaire l'appel réseau à chaque écran-module (Rendement → Personnel →
  /// Observation → ...) alors que la fiche du jour est déjà en mémoire.
  String? _bootstrappedKey;

  /// Vérification SYNCHRONE (pas d'`await`) — `true` si les données de cette
  /// machine/poste/aujourd'hui sont déjà en mémoire. Utilisé par les écrans
  /// pour décider, dès `initState()`, de démarrer `_loading` à `false` et
  /// d'éviter ainsi le flash du skeleton de chargement lors d'un "Suivant"
  /// vers un écran qui n'a en réalité aucune donnée à recharger (même
  /// contrôleur permanent partagé entre toutes les pages du parcours).
  bool isBootstrappedFor(String machineNum, String posteValue) {
    final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
    return _bootstrappedKey == '$machineNum|$posteValue|$today';
  }

  /// Parcours opérateur "carte" : retrouve la fiche du jour pour
  /// (machine, poste) ou prépare un formulaire vierge si elle n'existe pas
  /// encore. Idempotente — plusieurs modules peuvent l'appeler à la suite,
  /// le 2e appel retrouve la fiche déjà créée par le 1er.
  /// Ne pré-remplit jamais date/heure/opérateur : ces champs sont saisis
  /// par l'utilisateur à l'étape "Informations générales".
  /// `forceRefresh: true` (bouton "Actualiser") ignore le cache et refait
  /// l'appel réseau même si (machine, poste) n'a pas changé.
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
      final existing = await PorPromeshService.instance.fetchAll(
        machine: machineNum,
        poste: posteValue,
        date: today,
      );
      if (existing.isNotEmpty) {
        loadFromModel(existing.first, id: existing.first.id);
      } else {
        resetForm();
        setMachinePoste(machine: machineNum, poste: posteValue);
      }
      _seedDefaultQualiteRowsIfEmpty();
      _bootstrappedKey = key;
    } finally {
      isLoading.value = false;
    }
  }

  /// Entrée "Nouvelle fiche" — l'id a déjà été décidé côté backend
  /// (POST /por-promesh/new crée toujours une fiche neuve et indépendante).
  /// Charge cette fiche précise par id, sans aucune recherche par
  /// machine/poste/date côté client. `resetForm()` vide explicitement tous
  /// les TextEditingController/RxList/observables (y compris ceux qu'une
  /// fiche précédente aurait pu laisser remplis) avant `loadFromModel` —
  /// aucune valeur d'une autre fiche ne doit pouvoir survivre au changement
  /// d'id, même si `loadFromModel` réécrit déjà chaque champ individuellement.
  /// Met à jour le même cache que `bootstrapForMachinePoste` pour que les
  /// écrans suivants (Personnel, Observation, ...) ne refassent pas d'appel
  /// réseau.
  Future<void> bootstrapWithId(String machineNum, String posteValue, String id) async {
    if (recordId == id) return;

    isLoading.value = true;
    try {
      final model = await PorPromeshService.instance.fetchById(id);
      resetForm();
      loadFromModel(model, id: id);
      _seedDefaultQualiteRowsIfEmpty();
      final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
      _bootstrappedKey = '$machineNum|$posteValue|$today';
    } finally {
      isLoading.value = false;
    }
  }

  // ── Étape 1 — Informations générales ───────────────────────────────────
  final dateProduction = TextEditingController();
  final Rxn<DateTime> selectedDateProduction = Rxn<DateTime>();

  final heureDebut = TextEditingController();
  final Rxn<TimeOfDay> selectedHeureDebut = Rxn<TimeOfDay>();

  final heureFin = TextEditingController();
  final Rxn<TimeOfDay> selectedHeureFin = Rxn<TimeOfDay>();

  final operateur = TextEditingController();

  // ── Dimensions maille ───────────────────────────────────────────────────
  final diametreMaille1 = TextEditingController();
  final diametreMaille2 = TextEditingController();
  final diametreMaille3 = TextEditingController();

  // ── Module Rendement (parcours opérateur simplifié) — une seule mesure,
  // toujours exprimée en m², jamais en kg.
  final productionM2 = TextEditingController();

  // ── Démarrage production ────────────────────────────────────────────────
  final demarrageProductionHeure1 = TextEditingController();
  final Rxn<TimeOfDay> selectedDemarrageProductionHeure1 = Rxn<TimeOfDay>();
  final demarrageProductionQuantite1 = TextEditingController();

  final demarrageProductionHeure2 = TextEditingController();
  final Rxn<TimeOfDay> selectedDemarrageProductionHeure2 = Rxn<TimeOfDay>();
  final demarrageProductionQuantite2 = TextEditingController();

  // ── Personnel actif ─────────────────────────────────────────────────────
  final responsable1 = TextEditingController();
  final responsable2 = TextEditingController();
  final operateur1 = TextEditingController();
  final operateur2 = TextEditingController();
  final aideOperateur = TextEditingController();
  final manoeuvre = TextEditingController();
  final stagiaire1 = TextEditingController();
  final stagiaire2 = TextEditingController();
  final observationPersonnel = TextEditingController();

  // ── Tables dynamiques (étape 1) ─────────────────────────────────────────
  final RxList<Map<String, dynamic>> arretsMachine = <Map<String, dynamic>>[].obs;
  final RxList<Map<String, dynamic>> consommations = <Map<String, dynamic>>[].obs;

  // ── Fin de travail ───────────────────────────────────────────────────────
  final heureFinTravail = TextEditingController();
  final Rxn<TimeOfDay> selectedHeureFinTravail = Rxn<TimeOfDay>();
  final observationFinTravail = TextEditingController();
  final totalMainOeuvre = TextEditingController();
  final totalChuteBarres = TextEditingController();
  final totalDechetGraine = TextEditingController();

  // ── Visas ─────────────────────────────────────────────────────────────────
  final visaProduction = TextEditingController();
  final visaControleurQualite = TextEditingController();
  final visaDirection = TextEditingController();

  // ── Étape 2 — Plan de Process PROMESH ──────────────────────────────────
  final RxnString air = RxnString();
  final RxnString niveauBainEau = RxnString();

  final temperatureEau = TextEditingController();
  // Saisie libre (plus de boutons préréglés 160°/170°/180°) — anciennement
  // "Température demandée" (`temperatureDemandee`), renommée pour refléter
  // ce qu'elle mesure réellement.
  final temperaturePistons = TextEditingController();

  final RxnString etatPistons = RxnString();
  final RxnString fluideVisuel = RxnString();
  final RxnString etatDisqueCoupe = RxnString();

  // ── Étape 3 — Contrôle Qualité ──────────────────────────────────────────
  // `note` et `signatureChefEquipe` ont été supprimés — écran simplifié au
  // seul tableau de mesures (heure/numeroPlaque/maille/longueur/largeur/
  // statut). `hauteur` a également été supprimée du tableau (colonne
  // droppée en base, plus aucune trace nulle part).
  //
  // Chaque ligne = une mesure toutes les 3h. `_kDefaultQualiteHeures`
  // pré-remplit 6 lignes (06:00→21:00) dès qu'une fiche vierge est
  // bootstrappée (voir `_seedDefaultQualiteRowsIfEmpty`) ; l'utilisateur
  // peut en ajouter d'autres via "+ Ajouter une mesure"
  // (`QualityMeasurementCard._addRow`).
  final RxList<Map<String, dynamic>> controlesQualite = <Map<String, dynamic>>[].obs;

  static const List<String> _kDefaultQualiteHeures = ['06:00', '09:00', '12:00', '15:00', '18:00', '21:00'];

  void _seedDefaultQualiteRowsIfEmpty() {
    if (controlesQualite.isNotEmpty) return;
    controlesQualite.assignAll([
      for (final heure in _kDefaultQualiteHeures)
        {
          'heure': heure,
          'numeroPlaque': '',
          'maille': '',
          'longueur': '',
          'largeur': '',
          'statutCOQ': null,
        },
    ]);
  }

  // ── Module N/C (parcours opérateur simplifié) — une seule conformité par
  // fiche. Les 3 derniers champs ne sont saisis (et envoyés) que lorsque
  // conformite == 'non_conforme'.
  final RxnString conformite = RxnString();
  final descriptionNonConformite = TextEditingController();
  final RxnString photoNonConformite = RxnString();
  final actionsCorrectives = TextEditingController();

  // ── Module Observation — pièces jointes (lecture seule, gérées via upload
  // direct, pas via buildModel/toJson) ─────────────────────────────────────
  final RxList<Map<String, dynamic>> attachments = <Map<String, dynamic>>[].obs;

  // ── Étape 5 — Contrôle Process PROMESH ──────────────────────────────────
  // Grille à lignes fixes, répétée pour chaque créneau de contrôle —
  // l'utilisateur ne fait que remplir P1 / CorP1 / P2 / CorP2 pour chaque ligne.
  static const _processControlParametres = [
    'Niveau bain de résine',
    'Diamètre de bar',
    'Température de machine',
    "Température d'eau",
    "Pression d'air comprimé",
    'Validation impression',
    'Nombre de barre en longueur',
    'Dimensions de maille',
    'Dimensions côté 1 long',
    'Dimensions côté 2 long',
    "Fuite d'eau",
    "Fuite d'air comprimé",
    'Etat disque de coupe',
    'Nombre de barre en largeur',
  ];

  static const Map<String, String> processControlBlocLabels = {
    'controle_08h20': 'Contrôle 08H20',
    'controle_10h20': 'Contrôle 10H20',
    'controle_14h20': 'Contrôle 14H20',
  };

  late final Map<String, List<ProcessControlRow>> processControlBlocs = {
    for (final bloc in processControlBlocLabels.keys)
      bloc: _processControlParametres.map((p) => ProcessControlRow(p)).toList(),
  };

  final observationsGenerales = TextEditingController();
  // Justifications partagées — distinctes de `observationsGenerales`
  // (commentaire libre du module Observation, sans rapport) : chaque
  // section a la sienne pour ne jamais se mélanger.
  final justificationControleProcess = TextEditingController();
  final justificationControleMachine = TextEditingController();
  final visaResponsableLogistiqueProcess = TextEditingController();
  final visaControleQualiteProcess = TextEditingController();
  final visaProductionProcess = TextEditingController();
  final dateValidationProcess = TextEditingController();
  final Rxn<DateTime> selectedDateValidationProcess = Rxn<DateTime>();

  // ── Complétude des sections (écran Contrôle Qualité, bouton "Terminer la
  // fiche") ───────────────────────────────────────────────────────────────
  //
  // Purement dérivé de l'état courant des champs (aucun flag persisté
  // séparément) : le contrôleur étant partagé (permanent) entre tous les
  // écrans-module de la session, ces getters reflètent toujours l'état le
  // plus récent dès qu'on atteint le dernier écran, sans appel réseau.

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
      ].any((ctrl) => ctrl.text.trim().isNotEmpty);

  bool get observationSaved => observationsGenerales.text.trim().isNotEmpty;

  bool get nonConformiteSaved {
    final v = conformite.value;
    if (v == null) return false;
    if (v == 'non_conforme') return descriptionNonConformite.text.trim().isNotEmpty;
    return true;
  }

  /// Chaque ligne (mesure toutes les 3h) doit avoir : heure, numéro de
  /// plaque, maille, longueur, largeur renseignés, ET un statut Conforme OU
  /// Non conforme (jamais aucun des deux — `statutCOQ` est une valeur
  /// unique nullable, "les deux à la fois" n'est structurellement pas
  /// possible). "Hauteur" a été retirée de cette liste (champ supprimé).
  /// Une fiche sans aucune ligne n'est plus considérée complète : les 6
  /// lignes par défaut (06:00→21:00) sont toujours pré-remplies au
  /// bootstrap (voir `_seedDefaultQualiteRowsIfEmpty`), donc une liste vide
  /// ne peut arriver que si l'utilisateur les a explicitement toutes
  /// supprimées.
  bool get controleProduitSaved {
    if (controlesQualite.isEmpty) return false;
    return controlesQualite.every((r) {
      final heure = (r['heure'] ?? '').toString().trim();
      final numeroPlaque = (r['numeroPlaque'] ?? '').toString().trim();
      final maille = (r['maille'] ?? '').toString().trim();
      final longueur = (r['longueur'] ?? '').toString().trim();
      final largeur = (r['largeur'] ?? '').toString().trim();
      final statut = r['statutCOQ'] as String?;
      if (heure.isEmpty || numeroPlaque.isEmpty || maille.isEmpty || longueur.isEmpty || largeur.isEmpty) {
        return false;
      }
      return statut == 'C' || statut == 'NC';
    });
  }

  bool get controleProcessSaved {
    for (final bloc in processControlBlocLabels.keys) {
      for (final cfg in processParamConfigs) {
        if (_processRowFor(bloc, cfg.parametre).p1.text.trim().isEmpty) return false;
      }
    }
    if (controleProcessHasNegative && justificationControleProcess.text.trim().isEmpty) return false;
    return true;
  }

  bool get controleProcessHasNegative {
    for (final bloc in processControlBlocLabels.keys) {
      for (final cfg in processParamConfigs) {
        if (cfg.kind == ProcessParamKind.numeric) continue;
        final value = _processRowFor(bloc, cfg.parametre).p1.text.trim();
        if (value.isNotEmpty && processParamIsNegative(cfg.kind, value)) return true;
      }
    }
    return false;
  }

  ProcessControlRow _processRowFor(String bloc, String parametre) =>
      processControlBlocs[bloc]!.firstWhere((r) => r.parametre == parametre);

  // Plage acceptable pour "Température d'eau" (Contrôle Machine) — pas de
  // valeur métier fournie : ajuster ces deux constantes à la consigne réelle
  // du site avant mise en production.
  static const double machineTemperatureEauMin = 40.0;
  static const double machineTemperatureEauMax = 60.0;

  bool get controleMachineTemperatureEauOutOfRange {
    final v = double.tryParse(temperatureEau.text.replaceAll(',', '.'));
    if (v == null) return false;
    return v < machineTemperatureEauMin || v > machineTemperatureEauMax;
  }

  bool get controleMachineHasNegative =>
      air.value == '< 6 bars' ||
      niveauBainEau.value == 'Mauvais' ||
      controleMachineTemperatureEauOutOfRange ||
      etatPistons.value == 'Sale' ||
      fluideVisuel.value == 'Présence' ||
      etatDisqueCoupe.value == 'NOK';

  bool get controleMachineSaved {
    final required = [
      air.value,
      niveauBainEau.value,
      etatPistons.value,
      fluideVisuel.value,
      etatDisqueCoupe.value,
    ];
    if (required.any((v) => v == null || v.isEmpty)) return false;
    if (temperatureEau.text.trim().isEmpty) return false;
    if (temperaturePistons.text.trim().isEmpty) return false;
    if (controleMachineHasNegative && justificationControleMachine.text.trim().isEmpty) return false;
    return true;
  }

  // ── Complétude par section ─────────────────────────────────────────────

  /// Étape 1 — Contrôle Qualité (mesures heure/numéro de plaque/maille/
  /// longueur/largeur/statut). Logique inchangée (= ancien `controleProduitSaved`).
  bool isQualiteComplete() => controleProduitSaved;

  /// Les 3 créneaux de saisie du Contrôle Process — un paramètre est valide
  /// dès qu'il a une valeur sur AU MOINS UN d'entre eux (plus de dépendance
  /// exclusive à 'controle_08h20').
  static const _processControlBlocsOrdre = ['controle_08h20', 'controle_10h20', 'controle_14h20'];

  /// Étape 2 — Contrôle Process. Pour chacun des 14 paramètres : valide dès
  /// qu'une valeur existe sur au moins un des 3 créneaux (08h20, 10h20,
  /// 14h20) — voir `_processControlBlocsOrdre`. La justification
  /// (`justificationControleProcess`) reste un champ saisissable mais n'est
  /// plus obligatoire et ne bloque plus la validation, quelle que soit la
  /// valeur saisie sur les paramètres.
  bool isProcessComplete() => true;

  /// Étape 3 — Paramètres du Poste. Ses tableaux P1/P2 affichent les MÊMES
  /// champs que Contrôle Process (colonnes 08h20/10h20/14h20 du tableau P1 =
  /// données déjà validées par `isProcessComplete()`, qui accepte désormais
  /// n'importe lequel des 3 créneaux) ; le tableau P2 est éditable mais
  /// explicitement non obligatoire (voir `isProcessComplete`). Aucune donnée
  /// supplémentaire propre à cet écran n'est exigée aujourd'hui — méthode
  /// séparée pour rester alignée sur le découpage en sections demandé, et
  /// prête si une exigence propre à cette page devait apparaître plus tard.
  bool isParametresPosteComplete() => true;

  /// Étape "Observations" — toujours obligatoire (commentaire général du
  /// poste). Logique inchangée (= ancien `observationSaved`).
  bool isObservationComplete() => observationSaved;

  /// "Non-conformité" — toujours obligatoire (statut conforme/non conforme
  /// + description si non conforme). Logique inchangée
  /// (= ancien `nonConformiteSaved`).
  bool isNonConformiteComplete() => nonConformiteSaved;

  /// Bouton "Terminer la fiche" — actif uniquement quand les sections
  /// réellement obligatoires du nouveau parcours (Qualité → Process →
  /// Paramètres du Poste, + Observations/Non-conformité) sont remplies.
  bool get canFinish {
    final rendement = rendementSaved;
    final personnel = personnelSaved;
    final controleMachine = controleMachineSaved;
    final qualite = isQualiteComplete();
    final process = isProcessComplete();
    final parametresPoste = isParametresPosteComplete();
    final observation = isObservationComplete();
    final nonConformite = isNonConformiteComplete();
    return rendement && personnel && controleMachine && qualite && process && parametresPoste && observation && nonConformite;
  }

  // ── Validators ────────────────────────────────────────────────────────
  String? requiredValidator(String? v, String label) {
    if (v == null || v.trim().isEmpty) return '$label est obligatoire';
    return null;
  }

  String? numberValidator(String? v, String label, {double? min}) {
    final s = (v ?? '').trim();
    if (s.isEmpty) return '$label est obligatoire';
    final n = double.tryParse(s.replaceAll(',', '.'));
    if (n == null) return '$label doit être un nombre';
    if (min != null && n < min) return '$label doit être >= $min';
    return null;
  }

  double? _toDouble(String text) {
    final s = text.trim();
    if (s.isEmpty) return null;
    return double.tryParse(s.replaceAll(',', '.'));
  }

  // ── Date / time pickers ──────────────────────────────────────────────
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

  Future<void> pickDateValidationProcess(BuildContext context) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: selectedDateValidationProcess.value ?? DateTime.now(),
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (picked == null) return;
    selectedDateValidationProcess.value = picked;
    dateValidationProcess.text = DateFormat('yyyy-MM-dd').format(picked);
  }

  Future<TimeOfDay?> _pickTime(BuildContext context, TimeOfDay? initial) {
    return showTimePicker(context: context, initialTime: initial ?? TimeOfDay.now());
  }

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

  Future<void> pickDemarrageProductionHeure1(BuildContext context) async {
    final picked = await _pickTime(context, selectedDemarrageProductionHeure1.value);
    if (picked == null) return;
    selectedDemarrageProductionHeure1.value = picked;
    demarrageProductionHeure1.text = formatTime24h(picked);
  }

  Future<void> pickDemarrageProductionHeure2(BuildContext context) async {
    final picked = await _pickTime(context, selectedDemarrageProductionHeure2.value);
    if (picked == null) return;
    selectedDemarrageProductionHeure2.value = picked;
    demarrageProductionHeure2.text = formatTime24h(picked);
  }

  Future<void> pickHeureFinTravail(BuildContext context) async {
    final picked = await _pickTime(context, selectedHeureFinTravail.value);
    if (picked == null) return;
    selectedHeureFinTravail.value = picked;
    heureFinTravail.text = formatTime24h(picked);
  }

  // ── Reset / load / build payload ─────────────────────────────────────
  void resetForm() {
    recordId = null;
    status.value = 'draft';
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

    diametreMaille1.clear();
    diametreMaille2.clear();
    diametreMaille3.clear();
    productionM2.clear();

    demarrageProductionHeure1.clear();
    selectedDemarrageProductionHeure1.value = null;
    demarrageProductionQuantite1.clear();
    demarrageProductionHeure2.clear();
    selectedDemarrageProductionHeure2.value = null;
    demarrageProductionQuantite2.clear();

    responsable1.clear();
    responsable2.clear();
    operateur1.clear();
    operateur2.clear();
    aideOperateur.clear();
    manoeuvre.clear();
    stagiaire1.clear();
    stagiaire2.clear();
    observationPersonnel.clear();

    arretsMachine.clear();
    consommations.clear();

    heureFinTravail.clear();
    selectedHeureFinTravail.value = null;
    observationFinTravail.clear();
    totalMainOeuvre.clear();
    totalChuteBarres.clear();
    totalDechetGraine.clear();

    visaProduction.clear();
    visaControleurQualite.clear();
    visaDirection.clear();

    air.value = null;
    niveauBainEau.value = null;
    temperatureEau.clear();
    temperaturePistons.clear();
    etatPistons.value = null;
    fluideVisuel.value = null;
    etatDisqueCoupe.value = null;

    controlesQualite.clear();
    conformite.value = null;
    descriptionNonConformite.clear();
    photoNonConformite.value = null;
    actionsCorrectives.clear();
    attachments.clear();

    for (final rows in processControlBlocs.values) {
      for (final row in rows) {
        row.p1.clear();
        row.p2.clear();
        row.corP1.value = false;
        row.corP2.value = false;
      }
    }
    observationsGenerales.clear();
    justificationControleProcess.clear();
    justificationControleMachine.clear();
    visaResponsableLogistiqueProcess.clear();
    visaControleQualiteProcess.clear();
    visaProductionProcess.clear();
    dateValidationProcess.clear();
    selectedDateValidationProcess.value = null;
  }

  Future<void> loadById(String id) async {
    isLoading.value = true;
    try {
      final m = await PorPromeshService.instance.fetchById(id);
      loadFromModel(m, id: id);
    } finally {
      isLoading.value = false;
    }
  }

  void loadFromModel(PorPromeshModel m, {String? id}) {
    recordId = id ?? m.id;
    status.value = m.status;
    isLocked.value = m.isLocked;
    lastUpdatedAt.value = DateTime.tryParse(m.updatedAt ?? '');
    machine.value = m.machine;
    poste.value = m.poste;

    dateProduction.text = m.dateProduction ?? '';
    selectedDateProduction.value = DateTime.tryParse(m.dateProduction ?? '');
    heureDebut.text = m.heureDebut ?? '';
    heureFin.text = m.heureFin ?? '';
    operateur.text = m.operateur ?? '';

    diametreMaille1.text = m.diametreMaille1 ?? '';
    diametreMaille2.text = m.diametreMaille2 ?? '';
    diametreMaille3.text = m.diametreMaille3 ?? '';
    productionM2.text = m.productionM2?.toString() ?? '';

    demarrageProductionHeure1.text = m.demarrageProductionHeure1 ?? '';
    demarrageProductionQuantite1.text = m.demarrageProductionQuantite1?.toString() ?? '';
    demarrageProductionHeure2.text = m.demarrageProductionHeure2 ?? '';
    demarrageProductionQuantite2.text = m.demarrageProductionQuantite2?.toString() ?? '';

    responsable1.text = m.personnelActif['responsable1'] ?? '';
    responsable2.text = m.personnelActif['responsable2'] ?? '';
    operateur1.text = m.personnelActif['operateur1'] ?? '';
    operateur2.text = m.personnelActif['operateur2'] ?? '';
    aideOperateur.text = m.personnelActif['aideOperateur'] ?? '';
    manoeuvre.text = m.personnelActif['manoeuvre'] ?? '';
    stagiaire1.text = m.personnelActif['stagiaire1'] ?? '';
    stagiaire2.text = m.personnelActif['stagiaire2'] ?? '';
    observationPersonnel.text = m.observationPersonnel ?? '';

    arretsMachine.assignAll(m.arretsMachine);
    consommations.assignAll(m.consommations);

    heureFinTravail.text = m.heureFinTravail ?? '';
    observationFinTravail.text = m.observationFinTravail ?? '';
    totalMainOeuvre.text = m.totalMainOeuvre?.toString() ?? '';
    totalChuteBarres.text = m.totalChuteBarres?.toString() ?? '';
    totalDechetGraine.text = m.totalDechetGraine?.toString() ?? '';

    visaProduction.text = m.visaProduction ?? '';
    visaControleurQualite.text = m.visaControleQualite ?? '';
    visaDirection.text = m.visaDirection ?? '';

    air.value = m.air;
    niveauBainEau.value = m.niveauBainEau;
    temperatureEau.text = m.temperatureEau?.toString() ?? '';
    temperaturePistons.text = m.temperaturePistons?.toString() ?? '';
    etatPistons.value = m.etatPistons;
    fluideVisuel.value = m.fluideVisuel;
    etatDisqueCoupe.value = m.etatDisqueCoupe;

    controlesQualite.assignAll(m.controlesQualite);
    conformite.value = m.conformite;
    descriptionNonConformite.text = m.descriptionNonConformite ?? '';
    photoNonConformite.value = m.photoNonConformite;
    actionsCorrectives.text = m.actionsCorrectives ?? '';
    attachments.assignAll(m.attachments);

    final byKey = <String, Map<String, dynamic>>{};
    for (final row in m.processControl) {
      final bloc = row['bloc']?.toString() ?? '';
      final parametre = row['parametre']?.toString() ?? '';
      byKey['$bloc|$parametre'] = row;
    }
    for (final entry in processControlBlocs.entries) {
      for (final row in entry.value) {
        final data = byKey['${entry.key}|${row.parametre}'];
        row.p1.text = data?['valeurP1']?.toString() ?? '';
        row.p2.text = data?['valeurP2']?.toString() ?? '';
        row.corP1.value = data?['corP1'] == true;
        row.corP2.value = data?['corP2'] == true;
      }
    }

    observationsGenerales.text = m.observationsGenerales ?? '';
    justificationControleProcess.text = m.justificationControleProcess ?? '';
    justificationControleMachine.text = m.justificationControleMachine ?? '';
    visaResponsableLogistiqueProcess.text = m.visaResponsableLogistiqueProcess ?? '';
    visaControleQualiteProcess.text = m.visaControleQualiteProcess ?? '';
    visaProductionProcess.text = m.visaProductionProcess ?? '';
    dateValidationProcess.text = m.dateValidationProcess ?? '';
    selectedDateValidationProcess.value = DateTime.tryParse(m.dateValidationProcess ?? '');
  }

  PorPromeshModel buildModel({required String forStatus}) {
    return PorPromeshModel(
      id: recordId,
      status: forStatus,
      machine: machine.value,
      poste: poste.value,
      dateProduction: dateProduction.text.trim().isEmpty ? null : dateProduction.text.trim(),
      heureDebut: heureDebut.text.trim().isEmpty ? null : heureDebut.text.trim(),
      heureFin: heureFin.text.trim().isEmpty ? null : heureFin.text.trim(),
      operateur: operateur.text.trim().isEmpty ? null : operateur.text.trim(),
      diametreMaille1: diametreMaille1.text.trim(),
      diametreMaille2: diametreMaille2.text.trim(),
      diametreMaille3: diametreMaille3.text.trim(),
      productionM2: _toDouble(productionM2.text),
      demarrageProductionHeure1:
          demarrageProductionHeure1.text.trim().isEmpty ? null : demarrageProductionHeure1.text.trim(),
      demarrageProductionQuantite1: _toDouble(demarrageProductionQuantite1.text),
      demarrageProductionHeure2:
          demarrageProductionHeure2.text.trim().isEmpty ? null : demarrageProductionHeure2.text.trim(),
      demarrageProductionQuantite2: _toDouble(demarrageProductionQuantite2.text),
      personnelActif: {
        'responsable1': responsable1.text.trim(),
        'responsable2': responsable2.text.trim(),
        'operateur1': operateur1.text.trim(),
        'operateur2': operateur2.text.trim(),
        'aideOperateur': aideOperateur.text.trim(),
        'manoeuvre': manoeuvre.text.trim(),
        'stagiaire1': stagiaire1.text.trim(),
        'stagiaire2': stagiaire2.text.trim(),
      },
      observationPersonnel: observationPersonnel.text.trim(),
      arretsMachine: arretsMachine.toList(),
      consommations: consommations.toList(),
      heureFinTravail: heureFinTravail.text.trim().isEmpty ? null : heureFinTravail.text.trim(),
      observationFinTravail: observationFinTravail.text.trim(),
      totalMainOeuvre: _toDouble(totalMainOeuvre.text),
      totalChuteBarres: _toDouble(totalChuteBarres.text),
      totalDechetGraine: _toDouble(totalDechetGraine.text),
      visaProduction: visaProduction.text.trim(),
      visaControleQualite: visaControleurQualite.text.trim(),
      visaDirection: visaDirection.text.trim(),
      air: air.value,
      niveauBainEau: niveauBainEau.value,
      temperatureEau: _toDouble(temperatureEau.text),
      temperaturePistons: _toDouble(temperaturePistons.text),
      etatPistons: etatPistons.value,
      fluideVisuel: fluideVisuel.value,
      etatDisqueCoupe: etatDisqueCoupe.value,
      controlesQualite: controlesQualite.toList(),
      conformite: conformite.value,
      descriptionNonConformite:
          conformite.value == 'non_conforme' ? descriptionNonConformite.text.trim() : null,
      photoNonConformite: conformite.value == 'non_conforme' ? photoNonConformite.value : null,
      actionsCorrectives: conformite.value == 'non_conforme' ? actionsCorrectives.text.trim() : null,
      attachments: attachments.toList(),
      processControl: _buildProcessControlRows(),
      observationsGenerales: observationsGenerales.text.trim(),
      justificationControleProcess: justificationControleProcess.text.trim(),
      justificationControleMachine: justificationControleMachine.text.trim(),
      visaResponsableLogistiqueProcess: visaResponsableLogistiqueProcess.text.trim(),
      visaControleQualiteProcess: visaControleQualiteProcess.text.trim(),
      visaProductionProcess: visaProductionProcess.text.trim(),
      dateValidationProcess:
          dateValidationProcess.text.trim().isEmpty ? null : dateValidationProcess.text.trim(),
    );
  }

  /// Exposition publique de `_buildProcessControlRows()` — lecture seule,
  /// utilisée par les cartes de consultation "Contrôle Process"/"Paramètres
  /// du Poste" (générées automatiquement côté backend depuis Contrôle
  /// Machine, voir `applyDerivedProcessControl` dans `porPromesh.service.js`
  /// — plus aucune saisie manuelle, ces cartes ne font qu'afficher l'état
  /// déjà en mémoire, rafraîchi après chaque `saveDraft()` via
  /// `loadFromModel`).
  List<Map<String, dynamic>> get processControlRows => _buildProcessControlRows();

  List<Map<String, dynamic>> _buildProcessControlRows() {
    final result = <Map<String, dynamic>>[];
    for (final entry in processControlBlocs.entries) {
      for (final row in entry.value) {
        result.add({
          'bloc': entry.key,
          'parametre': row.parametre,
          'valeurP1': row.p1.text.trim(),
          'corP1': row.corP1.value,
          'valeurP2': row.p2.text.trim(),
          'corP2': row.corP2.value,
        });
      }
    }
    return result;
  }

  /// Saves as draft (no full-form validation) — safe to call any time.
  Future<PorPromeshModel> saveDraft() async {
    final model = buildModel(forStatus: 'draft');
    final saved = recordId == null
        ? await PorPromeshService.instance.create(model)
        : await PorPromeshService.instance.update(recordId!, model);
    recordId = saved.id ?? recordId;
    status.value = 'draft';
    isLocked.value = saved.isLocked;
    lastUpdatedAt.value = DateTime.tryParse(saved.updatedAt ?? '') ?? DateTime.now();
    return saved;
  }

  /// Verrouillage définitif ("Terminer la saisie") : sauvegarde le brouillon
  /// puis appelle `POST /:id/validate` — seul endpoint qui fait réellement
  /// passer la fiche en VALIDE/isLocked côté backend (le champ `status`
  /// envoyé via `update()` est ignoré par le serveur). Le backend renvoie une
  /// erreur explicite si dateProduction/heureDebut/heureFin sont manquants.
  Future<PorPromeshModel> submit() async {
    await saveDraft();
    if (recordId == null) {
      throw Exception('Impossible de terminer la saisie : fiche introuvable.');
    }
    final saved = await PorPromeshService.instance.validate(recordId!);
    recordId = saved.id ?? recordId;
    status.value = saved.status;
    isLocked.value = saved.isLocked;
    lastUpdatedAt.value = DateTime.tryParse(saved.updatedAt ?? '') ?? DateTime.now();
    return saved;
  }

  @override
  void onClose() {
    dateProduction.dispose();
    heureDebut.dispose();
    heureFin.dispose();
    operateur.dispose();
    diametreMaille1.dispose();
    diametreMaille2.dispose();
    diametreMaille3.dispose();
    productionM2.dispose();
    demarrageProductionHeure1.dispose();
    demarrageProductionQuantite1.dispose();
    demarrageProductionHeure2.dispose();
    demarrageProductionQuantite2.dispose();
    responsable1.dispose();
    responsable2.dispose();
    operateur1.dispose();
    operateur2.dispose();
    aideOperateur.dispose();
    manoeuvre.dispose();
    stagiaire1.dispose();
    stagiaire2.dispose();
    observationPersonnel.dispose();
    heureFinTravail.dispose();
    observationFinTravail.dispose();
    totalMainOeuvre.dispose();
    totalChuteBarres.dispose();
    totalDechetGraine.dispose();
    visaProduction.dispose();
    visaControleurQualite.dispose();
    visaDirection.dispose();
    descriptionNonConformite.dispose();
    actionsCorrectives.dispose();
    temperatureEau.dispose();
    temperaturePistons.dispose();
    observationsGenerales.dispose();
    justificationControleProcess.dispose();
    justificationControleMachine.dispose();
    visaResponsableLogistiqueProcess.dispose();
    visaControleQualiteProcess.dispose();
    visaProductionProcess.dispose();
    dateValidationProcess.dispose();
    for (final rows in processControlBlocs.values) {
      for (final row in rows) {
        row.dispose();
      }
    }
    super.onClose();
  }
}

/// Une ligne fixe de la grille "Contrôle Process PROMESH" — le libellé
/// (paramètre) est figé, seules P1 / CorP1 / P2 / CorP2 sont saisissables
/// par le responsable_logistique_achat.
class ProcessControlRow {
  final String parametre;
  final p1 = TextEditingController();
  final p2 = TextEditingController();
  final RxBool corP1 = false.obs;
  final RxBool corP2 = false.obs;

  ProcessControlRow(this.parametre);

  void dispose() {
    p1.dispose();
    p2.dispose();
  }
}

// ── Configuration des 14 paramètres "Contrôle Process" ───────────────────
//
// Source unique partagée par le contrôleur (complétude/`canFinish`) et
// l'écran (rendu des cartes) — `parametre` doit rester rigoureusement
// identique à `PorPromeshController._processControlParametres` ci-dessus
// (clé de recherche dans `processControlBlocs[bloc]`).

enum ProcessParamKind { choice3, choiceConforme, choiceOkNok, choiceFuite, numeric }

class ProcessParamConfig {
  final String parametre;
  final String emoji;
  final String title;
  final ProcessParamKind kind;
  final String? suffix;

  const ProcessParamConfig(this.parametre, this.emoji, this.title, this.kind, {this.suffix});
}

const List<ProcessParamConfig> processParamConfigs = [
  ProcessParamConfig('Niveau bain de résine', '🛢️', 'Niveau bain de résine', ProcessParamKind.choice3),
  ProcessParamConfig('Diamètre de bar', '📏', 'Diamètre de barre', ProcessParamKind.numeric),
  ProcessParamConfig('Température de machine', '🌡️', 'Température machine', ProcessParamKind.numeric, suffix: '°C'),
  ProcessParamConfig("Température d'eau", '💧', 'Température eau', ProcessParamKind.numeric, suffix: '°C'),
  ProcessParamConfig("Pression d'air comprimé", '💨', 'Pression air comprimé', ProcessParamKind.numeric, suffix: 'bar'),
  ProcessParamConfig('Validation impression', '🖨️', 'État impression', ProcessParamKind.choiceConforme),
  ProcessParamConfig('Nombre de barre en longueur', '📐', 'Nombre de barre en longueur', ProcessParamKind.numeric),
  ProcessParamConfig('Dimensions de maille', '⬜', 'Dimension de maille', ProcessParamKind.numeric),
  ProcessParamConfig('Dimensions côté 1 long', '↔️', 'Dimension côté 1', ProcessParamKind.numeric),
  ProcessParamConfig('Dimensions côté 2 long', '↕️', 'Dimension côté 2', ProcessParamKind.numeric),
  ProcessParamConfig("Fuite d'eau", '🚰', "Fuite d'eau", ProcessParamKind.choiceFuite),
  ProcessParamConfig("Fuite d'air comprimé", '💨', "Fuite d'air comprimé", ProcessParamKind.choiceFuite),
  ProcessParamConfig('Etat disque de coupe', '🪚', 'État disque de coupe', ProcessParamKind.choiceOkNok),
  ProcessParamConfig('Nombre de barre en largeur', '📐', 'Nombre de barre en largeur', ProcessParamKind.numeric),
];

bool processParamIsNegative(ProcessParamKind kind, String value) {
  switch (kind) {
    case ProcessParamKind.choice3:
      return value == 'Vide';
    case ProcessParamKind.choiceConforme:
      return value == 'Non Conforme';
    case ProcessParamKind.choiceOkNok:
      return value == 'NOK';
    case ProcessParamKind.choiceFuite:
      return value == 'Oui';
    case ProcessParamKind.numeric:
      return false;
  }
}
