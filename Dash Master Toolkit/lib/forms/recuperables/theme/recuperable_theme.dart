// lib/forms/recuperables/theme/recuperable_theme.dart
//
// Couleurs du module RÉCUPÉRABLES — Vert pour le module, Orange pour les
// fiches "En cours", Gris pour les fiches "Terminée" (réutilise les tokens
// kCrm* déjà en place, aucune nouvelle charte inventée).

import 'package:flutter/material.dart';

import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';

const Color kRecuperableColor = Color(0xFF16A34A); // Vert — module Récupérables
const Color kRecuperableOpen = kCrmWarning; // Orange — En cours
const Color kRecuperableClosed = kCrmTextSub; // Gris — Terminée

({String label, Color color, String emoji}) recuperableStatutInfo(String statut) {
  if (statut == 'cloturee') return (label: 'Terminée', color: kRecuperableClosed, emoji: '🔒');
  return (label: 'En cours', color: kRecuperableOpen, emoji: '🟢');
}
