// lib/forms/por_promesh/model/por_promesh_model.dart
//
// Data model for a "POR PROMESH" record — production control / process
// plan / quality control sheet. Mirrors the payload sent to / received
// from the (future) `/por-promesh` backend.

class PorPromeshModel {
  final String? id;
  // Numéro de fiche lisible (ex. "PROMESH-2026-000001") — jamais afficher
  // `id` (UUID) à l'utilisateur, ce champ est calculé par le backend.
  final String? numero;
  final String status; // 'draft' | 'submitted'
  // Verrouillée dès la création côté backend — `false` uniquement avant
  // le premier enregistrement (fiche pas encore créée).
  final bool isLocked;
  final String? createdBy;
  final Map<String, String>? creator; // {id, email, role} — résolu par le backend
  final String? createdAt;
  final String? updatedAt;

  // Machine PROMESH (1..4) et poste (matin/nuit) à l'origine de la fiche —
  // préremplis depuis la page Machine du module industriel.
  final String? machine;
  final String? poste;

  // ── Étape 1 — Contrôle Production ──────────────────────────────────────
  // Informations générales — saisies manuellement par l'opérateur (jamais
  // générées automatiquement) lors de l'étape "Informations générales".
  final String? dateProduction; // yyyy-MM-dd
  final String? heureDebut; // HH:mm
  final String? heureFin; // HH:mm
  final String? operateur;

  // Dimensions maille
  final String? diametreMaille1;
  final String? diametreMaille2;
  final String? diametreMaille3;

  // ── Module Rendement (parcours opérateur simplifié) — une seule mesure,
  // toujours exprimée en m², jamais en kg.
  final double? productionM2;

  // Démarrage production
  final String? demarrageProductionHeure1;
  final double? demarrageProductionQuantite1;
  final String? demarrageProductionHeure2;
  final double? demarrageProductionQuantite2;

  // Personnel actif
  final Map<String, String> personnelActif;
  final String? observationPersonnel;

  // Tables dynamiques (étape 1)
  final List<Map<String, dynamic>> arretsMachine;
  final List<Map<String, dynamic>> consommations;

  // Fin de travail
  final String? heureFinTravail;
  final String? observationFinTravail;
  final double? totalMainOeuvre;
  final double? totalChuteBarres;
  final double? totalDechetGraine;

  // Visas
  final String? visaProduction;
  final String? visaControleQualite;
  final String? visaDirection;

  // ── Étape 2 — Plan de Process PROMESH ──────────────────────────────────
  final String? air; // < 6 bar | ≥ 6 bar
  final String? niveauBainEau; // Mauvais | Moyen | Bien
  final double? temperatureEau;
  // Saisie libre (°C) — anciennement "Température demandée"
  // (`temperatureDemandee`), renommée pour refléter ce qu'elle mesure.
  final double? temperaturePistons;
  final String? etatPistons; // Propre | Sale
  final String? fluideVisuel; // Présence normale | Anomalie
  final String? etatDisqueCoupe; // OK | NOK

  // ── Étape 3 — Contrôle Qualité ──────────────────────────────────────────
  final List<Map<String, dynamic>> controlesQualite;

  // ── Module N/C (parcours opérateur simplifié) — une seule conformité par
  // fiche : 'conforme' | 'non_conforme'. Les 3 champs suivants ne sont
  // renseignés (et affichés) que lorsque non_conforme est sélectionné.
  final String? conformite;
  final String? descriptionNonConformite;
  final String? photoNonConformite;
  final String? actionsCorrectives;

  // Pièces jointes (module Observation) — en lecture seule ici, créées via
  // l'endpoint dédié POST /por-promesh/:id/attachments, pas via toJson().
  final List<Map<String, dynamic>> attachments;

  // ── Étape 5 — Contrôle Process PROMESH ───────────────────────────────────
  final List<Map<String, dynamic>> processControl;
  final String? observationsGenerales;
  // Justifications partagées des sections "Contrôle Process" et "Contrôle
  // Machine" de l'écran Contrôle Qualité — distinctes de
  // `observationsGenerales` (commentaire libre du module Observation).
  final String? justificationControleProcess;
  final String? justificationControleMachine;
  final String? visaResponsableLogistiqueProcess;
  final String? visaControleQualiteProcess;
  final String? visaProductionProcess;
  final String? dateValidationProcess; // yyyy-MM-dd

  const PorPromeshModel({
    this.id,
    this.numero,
    this.status = 'draft',
    this.isLocked = false,
    this.createdBy,
    this.creator,
    this.createdAt,
    this.updatedAt,
    this.machine,
    this.poste,
    this.dateProduction,
    this.heureDebut,
    this.heureFin,
    this.operateur,
    this.diametreMaille1,
    this.diametreMaille2,
    this.diametreMaille3,
    this.productionM2,
    this.demarrageProductionHeure1,
    this.demarrageProductionQuantite1,
    this.demarrageProductionHeure2,
    this.demarrageProductionQuantite2,
    this.personnelActif = const {},
    this.observationPersonnel,
    this.arretsMachine = const [],
    this.consommations = const [],
    this.conformite,
    this.descriptionNonConformite,
    this.photoNonConformite,
    this.actionsCorrectives,
    this.attachments = const [],
    this.heureFinTravail,
    this.observationFinTravail,
    this.totalMainOeuvre,
    this.totalChuteBarres,
    this.totalDechetGraine,
    this.visaProduction,
    this.visaControleQualite,
    this.visaDirection,
    this.air,
    this.niveauBainEau,
    this.temperatureEau,
    this.temperaturePistons,
    this.etatPistons,
    this.fluideVisuel,
    this.etatDisqueCoupe,
    this.controlesQualite = const [],
    this.processControl = const [],
    this.observationsGenerales,
    this.justificationControleProcess,
    this.justificationControleMachine,
    this.visaResponsableLogistiqueProcess,
    this.visaControleQualiteProcess,
    this.visaProductionProcess,
    this.dateValidationProcess,
  });

  /// Le backend renvoie `status` en français ("BROUILLON" / "VALIDE"), mais
  /// tout l'écran (liste, historique, dashboard) compare à 'draft' /
  /// 'submitted' — normaliser ici évite de corriger chaque écran séparément.
  static String _normalizeStatus(dynamic v) {
    final s = (v ?? '').toString().trim().toUpperCase();
    if (s == 'VALIDE' || s == 'SUBMITTED') return 'submitted';
    return 'draft';
  }

  static double? _toDouble(dynamic v) {
    if (v == null) return null;
    if (v is num) return v.toDouble();
    if (v is String) return double.tryParse(v.replaceAll(',', '.'));
    return null;
  }

  static List<Map<String, dynamic>> _toListOfMap(dynamic v) {
    if (v is! List) return [];
    return v.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  }

  static Map<String, String> _toMapOfString(dynamic v) {
    if (v is! Map) return {};
    return v.map((k, val) => MapEntry(k.toString(), (val ?? '').toString()));
  }

  static Map<String, String>? _toNullableMapOfString(dynamic v) {
    if (v is! Map) return null;
    return v.map((k, val) => MapEntry(k.toString(), (val ?? '').toString()));
  }

  factory PorPromeshModel.fromJson(Map<String, dynamic> json) {
    return PorPromeshModel(
      id: json['id']?.toString() ?? json['_id']?.toString(),
      numero: json['numero']?.toString(),
      status: _normalizeStatus(json['status']),
      isLocked: json['isLocked'] == true,
      createdBy: json['createdBy']?.toString(),
      creator: _toNullableMapOfString(json['creator']),
      createdAt: json['createdAt']?.toString(),
      updatedAt: json['updatedAt']?.toString(),
      machine: json['machine']?.toString(),
      poste: json['poste']?.toString(),
      dateProduction: json['dateProduction']?.toString(),
      heureDebut: json['heureDebut']?.toString(),
      heureFin: json['heureFin']?.toString(),
      operateur: json['operateur']?.toString(),
      diametreMaille1: json['diametreMaille1']?.toString(),
      diametreMaille2: json['diametreMaille2']?.toString(),
      diametreMaille3: json['diametreMaille3']?.toString(),
      productionM2: _toDouble(json['productionM2']),
      demarrageProductionHeure1: json['demarrageProductionHeure1']?.toString(),
      demarrageProductionQuantite1: _toDouble(json['demarrageProductionQuantite1']),
      demarrageProductionHeure2: json['demarrageProductionHeure2']?.toString(),
      demarrageProductionQuantite2: _toDouble(json['demarrageProductionQuantite2']),
      personnelActif: _toMapOfString(json['personnelActif']),
      observationPersonnel: json['observationPersonnel']?.toString(),
      arretsMachine: _toListOfMap(json['arretsMachine']),
      consommations: _toListOfMap(json['consommations']),
      conformite: json['conformite']?.toString(),
      descriptionNonConformite: json['descriptionNonConformite']?.toString(),
      photoNonConformite: json['photoNonConformite']?.toString(),
      actionsCorrectives: json['actionsCorrectives']?.toString(),
      heureFinTravail: json['heureFinTravail']?.toString(),
      observationFinTravail: json['observationFinTravail']?.toString(),
      totalMainOeuvre: _toDouble(json['totalMainOeuvre']),
      totalChuteBarres: _toDouble(json['totalChuteBarres']),
      totalDechetGraine: _toDouble(json['totalDechetGraine']),
      visaProduction: json['visaProduction']?.toString(),
      visaControleQualite: json['visaControleQualite']?.toString(),
      visaDirection: json['visaDirection']?.toString(),
      air: json['air']?.toString(),
      niveauBainEau: json['niveauBainEau']?.toString(),
      temperatureEau: _toDouble(json['temperatureEau']),
      temperaturePistons: _toDouble(json['temperaturePistons']),
      etatPistons: json['etatPistons']?.toString(),
      fluideVisuel: json['fluideVisuel']?.toString(),
      etatDisqueCoupe: json['etatDisqueCoupe']?.toString(),
      controlesQualite: _toListOfMap(json['controlesQualite']),
      attachments: _toListOfMap(json['attachments']),
      processControl: _toListOfMap(json['processControl']),
      observationsGenerales: json['observationsGenerales']?.toString(),
      justificationControleProcess: json['justificationControleProcess']?.toString(),
      justificationControleMachine: json['justificationControleMachine']?.toString(),
      visaResponsableLogistiqueProcess: json['visaResponsableLogistiqueProcess']?.toString(),
      visaControleQualiteProcess: json['visaControleQualiteProcess']?.toString(),
      visaProductionProcess: json['visaProductionProcess']?.toString(),
      dateValidationProcess: json['dateValidationProcess']?.toString(),
    );
  }

  /// Champs de type "heure" qui ne doivent jamais être envoyés comme "" —
  /// le backend attend `null` (ou l'absence du champ) plutôt qu'une chaîne vide.
  static const _heureKeys = [
    'heureDebut',
    'heureFin',
    'demarrageProductionHeure1',
    'demarrageProductionHeure2',
    'heureFinTravail',
  ];

  /// Champs numériques de `controlesQualite[]` qui ne doivent jamais être
  /// envoyés comme "" — Postgres lève une erreur de cast sur une colonne
  /// DECIMAL vide tout comme sur une colonne TIME vide.
  static const _controleQualiteNumericKeys = ['longueur', 'largeur'];

  static bool _isBlank(dynamic v) => v is String && v.trim().isEmpty;

  /// Remplace toute heure (ou mesure numérique de contrôle qualité) vide
  /// ("") par `null` dans le payload, juste avant l'envoi à l'API. Ne mute
  /// pas les maps d'origine (qui alimentent encore l'UI) — retourne des
  /// copies pour les listes imbriquées.
  static Map<String, dynamic> sanitizePayload(Map<String, dynamic> json) {
    final result = Map<String, dynamic>.from(json);

    for (final key in _heureKeys) {
      if (_isBlank(result[key])) result[key] = null;
    }

    final controlesQualite = result['controlesQualite'];
    if (controlesQualite is List) {
      result['controlesQualite'] = controlesQualite.map((row) {
        if (row is! Map) return row;
        final copy = Map<String, dynamic>.from(row);
        for (final key in _controleQualiteNumericKeys) {
          if (_isBlank(copy[key])) copy[key] = null;
        }
        return copy;
      }).toList();
    }

    return result;
  }

  Map<String, dynamic> toJson() => sanitizePayload({
        if (id != null) 'id': id,
        'status': status,
        'machine': machine,
        'poste': poste,
        'dateProduction': dateProduction,
        'heureDebut': heureDebut,
        'heureFin': heureFin,
        'operateur': operateur,
        'diametreMaille1': diametreMaille1,
        'diametreMaille2': diametreMaille2,
        'diametreMaille3': diametreMaille3,
        'productionM2': productionM2,
        'demarrageProductionHeure1': demarrageProductionHeure1,
        'demarrageProductionQuantite1': demarrageProductionQuantite1,
        'demarrageProductionHeure2': demarrageProductionHeure2,
        'demarrageProductionQuantite2': demarrageProductionQuantite2,
        'personnelActif': personnelActif,
        'observationPersonnel': observationPersonnel,
        'arretsMachine': arretsMachine,
        'consommations': consommations,
        'conformite': conformite,
        'descriptionNonConformite': descriptionNonConformite,
        'photoNonConformite': photoNonConformite,
        'actionsCorrectives': actionsCorrectives,
        'heureFinTravail': heureFinTravail,
        'observationFinTravail': observationFinTravail,
        'totalMainOeuvre': totalMainOeuvre,
        'totalChuteBarres': totalChuteBarres,
        'totalDechetGraine': totalDechetGraine,
        'visaProduction': visaProduction,
        'visaControleQualite': visaControleQualite,
        'visaDirection': visaDirection,
        'air': air,
        'niveauBainEau': niveauBainEau,
        'temperatureEau': temperatureEau,
        'temperaturePistons': temperaturePistons,
        'etatPistons': etatPistons,
        'fluideVisuel': fluideVisuel,
        'etatDisqueCoupe': etatDisqueCoupe,
        'controlesQualite': controlesQualite,
        'processControl': processControl,
        'observationsGenerales': observationsGenerales,
        'justificationControleProcess': justificationControleProcess,
        'justificationControleMachine': justificationControleMachine,
        'visaResponsableLogistiqueProcess': visaResponsableLogistiqueProcess,
        'visaControleQualiteProcess': visaControleQualiteProcess,
        'visaProductionProcess': visaProductionProcess,
        'dateValidationProcess': dateValidationProcess,
      });
}
