// lib/forms/por_promesh/view/modules/controle_qualite/cq_theme.dart
//
// Tokens de design partagés par tous les widgets du module "Contrôle
// Qualité PROMESH" — coins arrondis, ombres légères, en-tête de carte
// icône+titre. Inspiré des interfaces industrielles (Siemens/Schneider/ABB) :
// cartes nettes, icônes Material colorées (pas d'emoji), espacement
// homogène 24px entre sections.

import 'package:flutter/material.dart';

import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/por_promesh/controller/por_promesh_controller.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

// Densité "ERP" (SAP/Odoo Enterprise/Siemens/Schneider) — réduit par
// rapport aux valeurs d'origine pour qu'un écran Full HD affiche tout le
// contenu principal sans scroll excessif. Mêmes couleurs/coins arrondis,
// juste des marges/paddings/tailles de police plus compacts.
const double kCqCardRadius = 14;
const double kCqInnerRadius = 10;
const double kCqSectionGap = 14;

List<BoxShadow> cqCardShadow(Color tint) =>
    [BoxShadow(color: tint.withOpacity(0.06), blurRadius: 10, offset: const Offset(0, 3))];

/// Conteneur de section Material 3 — radius/ombre/padding compacts.
/// Brique de base de toutes les grandes cartes de l'écran.
class CqCardSurface extends StatelessWidget {
  final Widget child;
  const CqCardSurface({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: kCrmSurface,
        borderRadius: BorderRadius.circular(kCqCardRadius),
        boxShadow: cqCardShadow(Colors.black),
      ),
      child: child,
    );
  }
}

/// En-tête icône colorée + titre (+ sous-titre optionnel) — utilisé en haut
/// de chaque grande carte de section et de chaque carte de paramètre.
class CqCardHeader extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final Color color;
  final double iconBoxSize;

  const CqCardHeader({
    super.key,
    required this.icon,
    required this.title,
    required this.color,
    this.subtitle,
    this.iconBoxSize = 28,
  });

  @override
  Widget build(BuildContext context) {
    return Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
      Container(
        width: iconBoxSize,
        height: iconBoxSize,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(8)),
        child: Icon(icon, size: iconBoxSize * 0.55, color: color),
      ),
      const SizedBox(width: 8),
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          Text(AppLocalizations.of(context).translate(title), maxLines: 1, overflow: TextOverflow.ellipsis, style: tInter(fontSize: 12.5, fontWeight: FontWeight.w800, color: kCrmText)),
          if (subtitle != null) ...[
            const SizedBox(height: 1),
            Text(AppLocalizations.of(context).translate(subtitle!), maxLines: 1, overflow: TextOverflow.ellipsis, style: tInter(fontSize: 10, color: kCrmTextSub)),
          ],
        ]),
      ),
    ]);
  }
}

/// En-tête de grande section (au-dessus d'une [CqCardSurface]) — icône dans
/// un cadre compact, titre + sous-titre.
class CqSectionHeading extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final Color color;

  const CqSectionHeading({super.key, required this.icon, required this.title, required this.subtitle, required this.color});

  @override
  Widget build(BuildContext context) {
    return Row(children: [
      Container(
        width: 32,
        height: 32,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(10)),
        child: Icon(icon, size: 17, color: color),
      ),
      const SizedBox(width: 10),
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(AppLocalizations.of(context).translate(title), style: tInter(fontSize: 14, fontWeight: FontWeight.w900, color: kCrmText)),
          Text(AppLocalizations.of(context).translate(subtitle), style: tInter(fontSize: 10.5, color: kCrmTextSub)),
        ]),
      ),
    ]);
  }
}

/// Icône Material par paramètre "Contrôle Process" (14 paramètres × 3
/// créneaux horaires) — remplace les emoji par des icônes vectorielles
/// colorées (style industriel), sans changer la clé `parametre` qui reste
/// la source de vérité métier (`PorPromeshController._processControlParametres`).
IconData cqProcessParamIcon(String parametre) {
  switch (parametre) {
    case 'Niveau bain de résine':
      return Icons.science_outlined;
    case 'Diamètre de bar':
      return Icons.straighten_rounded;
    case 'Température de machine':
      return Icons.thermostat_rounded;
    case "Température d'eau":
      return Icons.water_drop_rounded;
    case "Pression d'air comprimé":
      return Icons.air_rounded;
    case 'Validation impression':
      return Icons.print_outlined;
    case 'Nombre de barre en longueur':
      return Icons.height_rounded;
    case 'Dimensions de maille':
      return Icons.grid_on_rounded;
    case 'Dimensions côté 1 long':
      return Icons.compare_arrows_rounded;
    case 'Dimensions côté 2 long':
      return Icons.swap_vert_rounded;
    case "Fuite d'eau":
      return Icons.water_damage_outlined;
    case "Fuite d'air comprimé":
      return Icons.bolt_rounded;
    case 'Etat disque de coupe':
      return Icons.content_cut_rounded;
    case 'Nombre de barre en largeur':
      return Icons.unfold_more_rounded;
    default:
      return Icons.tune_rounded;
  }
}

/// Icône Material par champ "Contrôle Machine" (7 champs de l'Étape 2 —
/// état général machine, distinct du suivi horaire "Contrôle Process").
/// `bainResine`, `etatAtelier` et `zoneStockage` ont été retirés (champs
/// supprimés du module) ; `temperatureDemandee` a été renommée
/// `temperaturePistons`.
enum CqMachineField {
  air,
  niveauBainEau,
  temperatureEau,
  temperaturePistons,
  etatPistons,
  fluideVisuel,
  etatDisqueCoupe,
}

IconData cqMachineFieldIcon(CqMachineField field) {
  switch (field) {
    case CqMachineField.air:
      return Icons.air_rounded;
    case CqMachineField.niveauBainEau:
      return Icons.water_drop_outlined;
    case CqMachineField.temperatureEau:
      return Icons.device_thermostat_rounded;
    case CqMachineField.temperaturePistons:
      return Icons.local_fire_department_rounded;
    case CqMachineField.etatPistons:
      return Icons.settings_rounded;
    case CqMachineField.fluideVisuel:
      return Icons.water_damage_rounded;
    case CqMachineField.etatDisqueCoupe:
      return Icons.content_cut_rounded;
  }
}

/// Calcule l'état "conforme" (case COR) d'un paramètre "Contrôle Process" à
/// partir de sa valeur saisie — dérivé automatiquement, jamais coché à la
/// main : vide ⇒ non rempli (décoché), sinon `!processParamIsNegative`.
/// Logique métier inchangée (même fonction `processParamIsNegative` que le
/// reste du contrôleur) — seule la case COR, jamais affichée jusqu'ici,
/// devient visible dans les tableaux récapitulatifs P1/P2.
bool cqComputeCorP1(ProcessParamKind kind, String value) {
  final v = value.trim();
  if (v.isEmpty) return false;
  return !processParamIsNegative(kind, v);
}
