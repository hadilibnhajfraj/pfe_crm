// lib/forms/hr/theme/hr_theme.dart
//
// Couleurs du module RH — palette demandée : Bleu RH / Vert Validation /
// Orange En attente / Rouge Refus. Les 3 couleurs de statut réutilisent
// exactement les tokens `kCrm*` déjà utilisés partout ailleurs dans l'app
// (aucune nouvelle charte inventée) ; seule la couleur d'accent "RH" est
// dédiée à ce module (comme kPromeshColor/kProbarColor/kMelangeColor pour
// le module industriel).

import 'package:flutter/material.dart';

import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';

const Color kHrColor = Color(0xFF2563EB); // Bleu RH
const Color kHrAccepted = kCrmSuccess; // Vert — Acceptée
const Color kHrPending = kCrmWarning; // Orange — En attente
const Color kHrRefused = kCrmDanger; // Rouge — Refusée
const Color kHrProcessed = Color(0xFF64748B); // Gris — Traitée

({String label, Color color, String emoji}) hrStatutInfo(String statut) {
  switch (statut) {
    case 'acceptee':
      return (label: 'Acceptée', color: kHrAccepted, emoji: '🟢');
    case 'refusee':
      return (label: 'Refusée', color: kHrRefused, emoji: '🔴');
    case 'traitee':
      return (label: 'Traitée', color: kHrProcessed, emoji: '⚪');
    default:
      return (label: 'En attente', color: kHrPending, emoji: '🟠');
  }
}
