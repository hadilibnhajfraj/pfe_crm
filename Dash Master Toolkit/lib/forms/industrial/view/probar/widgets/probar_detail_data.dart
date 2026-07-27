// lib/forms/industrial/view/probar/widgets/probar_detail_data.dart
//
// Parse en lecture seule d'un IndustrialRecordModel (module 'probar') vers des
// champs typés — même logique de décodage que ProbarController.loadFromModel :
// nouveau format compact (`description` = JSON court hd/hf/cm/qm/pc…) avec
// repli sur l'ancien format legacy (`observations` = JSON complet), sans
// aucun TextEditingController puisque l'écran détail est entièrement lecture
// seule.
//
// La page Détail PROBAR n'affiche plus la section Contrôle Qualité (4
// créneaux L1-L4) — `cq`/`controlesQualite` n'est donc plus décodé ici (les
// données restent inchangées côté fiche/écran de saisie, seule cette lecture
// a été retirée).

import 'dart:convert';

import '../../../model/industrial_record_model.dart';

class ProbarDetailData {
  final String? heureDebut;
  final String? heureFin;
  final String observationsText;

  // Clés : responsable1, responsable2, operateur1, operateur2,
  // aideOperateur, manoeuvre, stagiaire1, stagiaire2.
  final Map<String, String?> personnel;

  final Map<String, String?> machineControl;
  final Map<String, String?> qualiteMesures;

  final String? descriptionNonConformite;
  final String? actionsCorrectives;

  const ProbarDetailData({
    this.heureDebut,
    this.heureFin,
    this.observationsText = '',
    this.personnel = const {},
    this.machineControl = const {},
    this.qualiteMesures = const {},
    this.descriptionNonConformite,
    this.actionsCorrectives,
  });

  factory ProbarDetailData.fromModel(IndustrialRecordModel m) {
    final rawDesc = (m.description ?? '').trim();
    if (rawDesc.startsWith('{')) {
      try {
        final d = jsonDecode(rawDesc) as Map<String, dynamic>;
        return _fromCompact(d, m.observations ?? '');
      } catch (_) {}
    }

    final rawObs = (m.observations ?? '').trim();
    if (rawObs.startsWith('{')) {
      try {
        final obs = jsonDecode(rawObs) as Map<String, dynamic>;
        return _fromLegacy(obs);
      } catch (_) {}
    }

    return ProbarDetailData(observationsText: m.observations ?? '');
  }

  static ProbarDetailData _fromCompact(Map<String, dynamic> d, String observationsText) {
    final cm = (d['cm'] as Map?)?.cast<String, dynamic>() ?? {};
    final qm = (d['qm'] as Map?)?.cast<String, dynamic>() ?? {};
    final p = (d['p'] as Map?)?.cast<String, dynamic>() ?? {};

    final personnel = <String, String?>{
      'responsable1': p['r1']?.toString(),
      'responsable2': p['r2']?.toString(),
      'operateur1': p['o1']?.toString(),
      'operateur2': p['o2']?.toString(),
      'aideOperateur': p['ao']?.toString(),
      'manoeuvre': p['mn']?.toString(),
      'stagiaire1': p['s1']?.toString(),
      'stagiaire2': p['s2']?.toString(),
    };

    // 'bainResine' (clé 'br')/'temperatureDemandee' (clé 'td')/l'ancien
    // 'four' OK-NOK (clé 'fo') ne sont plus affichés — non repris ici. 'fv'
    // reste la même donnée, seul le libellé affiché change ("Fuite
    // Visuelle" au lieu de "Fluide Visuel").
    final machineControl = <String, String?>{
      'air': cm['ai']?.toString(),
      'niveauBainEau': cm['nb']?.toString(),
      'temperatureEau': cm['te']?.toString(),
      'etatPistons': cm['ep']?.toString(),
      'fuiteVisuelle': cm['fv']?.toString(),
      'etatDisqueCoupe': cm['ed']?.toString(),
      'bobine': cm['bo']?.toString(),
      'nombreBobines': cm['nbb']?.toString(),
      'resistance': cm['rs']?.toString(),
      'fourZone1': cm['z1']?.toString(),
      'fourZone2': cm['z2']?.toString(),
      'fourZone3': cm['z3']?.toString(),
      'bainEauFiltre': cm['bf']?.toString(),
      'machineCeinture': cm['mc']?.toString(),
      'machineBobinage': cm['mb']?.toString(),
      'justification': cm['jm']?.toString(),
    };

    // l{n}h = Heure (texte "HH:mm"), l{n}l = Longueur (mm), l{n}m = Grammage
    // (g/m²), l{n}d = Diamètre (mm) — clés courtes inchangées (compatibilité
    // avec les fiches existantes), seuls le libellé/le type de saisie ont
    // changé côté écran de saisie (voir probar_controle_machine_screen.dart).
    final qualiteMesures = <String, String?>{
      'l1h': qm['l1h']?.toString(), 'l1l': qm['l1l']?.toString(), 'l1m': qm['l1m']?.toString(), 'l1d': qm['l1d']?.toString(),
      'l2h': qm['l2h']?.toString(), 'l2l': qm['l2l']?.toString(), 'l2m': qm['l2m']?.toString(), 'l2d': qm['l2d']?.toString(),
      'l3h': qm['l3h']?.toString(), 'l3l': qm['l3l']?.toString(), 'l3m': qm['l3m']?.toString(), 'l3d': qm['l3d']?.toString(),
      'l4h': qm['l4h']?.toString(), 'l4l': qm['l4l']?.toString(), 'l4m': qm['l4m']?.toString(), 'l4d': qm['l4d']?.toString(),
      'tp': qm['tp']?.toString(),
    };

    return ProbarDetailData(
      heureDebut: d['hd']?.toString(),
      heureFin: d['hf']?.toString(),
      observationsText: observationsText,
      personnel: personnel,
      machineControl: machineControl,
      qualiteMesures: qualiteMesures,
      descriptionNonConformite: d['dnc']?.toString(),
      actionsCorrectives: d['ac']?.toString(),
    );
  }

  static ProbarDetailData _fromLegacy(Map<String, dynamic> obs) {
    final cm = (obs['controleMachine'] as Map?)?.cast<String, dynamic>() ?? {};
    // Anciennes fiches (avant compact JSON) : bainResine/temperatureDemandee
    // ne sont plus affichés ; four/zones/nombreBobines n'existaient pas
    // encore dans ce format, donc null (aucune donnée à reprendre).
    final machineControl = <String, String?>{
      'air': cm['air']?.toString(),
      'niveauBainEau': cm['niveauBainEau']?.toString(),
      'temperatureEau': cm['temperatureEau']?.toString(),
      'etatPistons': cm['etatPistons']?.toString(),
      'fuiteVisuelle': cm['fluideVisuel']?.toString(),
      'etatDisqueCoupe': cm['etatDisqueCoupe']?.toString(),
      'bobine': null,
      'nombreBobines': null,
      'resistance': null,
      'fourZone1': null,
      'fourZone2': null,
      'fourZone3': null,
      'bainEauFiltre': null,
      'machineCeinture': null,
      'machineBobinage': null,
      'justification': cm['justificationControleMachine']?.toString(),
    };

    final legacyPersonnel = (obs['personnel'] as Map?)?.cast<String, dynamic>() ?? {};
    final personnel = <String, String?>{
      'responsable1': legacyPersonnel['responsable1']?.toString(),
      'responsable2': legacyPersonnel['responsable2']?.toString(),
      'operateur1': legacyPersonnel['operateur1']?.toString(),
      'operateur2': legacyPersonnel['operateur2']?.toString(),
      'aideOperateur': legacyPersonnel['aideOperateur']?.toString(),
      'manoeuvre': legacyPersonnel['manoeuvre']?.toString(),
      'stagiaire1': legacyPersonnel['stagiaire1']?.toString(),
      'stagiaire2': legacyPersonnel['stagiaire2']?.toString(),
    };

    return ProbarDetailData(
      heureDebut: obs['heureDebut']?.toString(),
      heureFin: obs['heureFin']?.toString(),
      observationsText: obs['texte']?.toString() ?? '',
      personnel: personnel,
      machineControl: machineControl,
      descriptionNonConformite: obs['descriptionNonConformite']?.toString(),
      actionsCorrectives: obs['actionsCorrectives']?.toString(),
    );
  }
}
