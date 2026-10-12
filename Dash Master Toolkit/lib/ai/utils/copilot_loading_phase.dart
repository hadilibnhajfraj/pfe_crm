// lib/ai/utils/copilot_loading_phase.dart
//
// « Loading intelligent » : pendant que le Copilot prépare sa réponse,
// l'indicateur dit CE QUI est en train de se passer — déduit localement du
// message envoyé (le backend n'émet pas d'événement de phase, et ce fichier
// n'en invente pas) :
//
// - un document joint ou cité      → « Analyse du document… »
// - une action / une confirmation  → « Préparation de l'action… »
// - sinon                          → « Recherche dans le CRM… »
//
// Fonction pure — testable isolément.
import 'package:flutter/material.dart';

enum CopilotLoadingPhase { crm, document, action }

extension CopilotLoadingPhaseX on CopilotLoadingPhase {
  String get label => switch (this) {
        CopilotLoadingPhase.document => 'Analyse du document…',
        CopilotLoadingPhase.action => "Préparation de l'action…",
        CopilotLoadingPhase.crm => 'Recherche dans le CRM…',
      };

  IconData get icon => switch (this) {
        CopilotLoadingPhase.document => Icons.description_outlined,
        CopilotLoadingPhase.action => Icons.bolt_rounded,
        CopilotLoadingPhase.crm => Icons.manage_search_rounded,
      };
}

String _fold(String text) {
  const from = 'àâäáãéèêëíìîïóòôöõúùûüçñ';
  const to = 'aaaaaeeeeiiiiooooouuuucn';
  final lower = text.toLowerCase();
  final out = StringBuffer();
  for (final ch in lower.split('')) {
    final i = from.indexOf(ch);
    out.write(i >= 0 ? to[i] : ch);
  }
  return out.toString();
}

final RegExp _documentReference = RegExp(r'\b(document|fichier|pdf|docx|xlsx|csv|piece jointe|ci-joint|ce rapport|dans le rapport)\b');
final RegExp _actionRequest = RegExp(
  r'^\s*(oui[\s,.!]*)?(je\s+)?(confirme|confirmer|annule|annuler)\b|\b(prepare[rz]?|cree[rz]?|creer|programme[rz]?|planifie[rz]?|ajoute[rz]?|envoie|envoyer|assigne[rz]?|deplace[rz]?|valide[rz]?|supprime[rz]?|modifie[rz]?|mets? a jour)\b',
);

// Questions typiques sur un texte déjà joint à la conversation.
final RegExp _readingVerb = RegExp(r'\b(resume[rz]?|synthese|mentionne[es]*|compare[rz]?|explique[rz]?|cite|contient|indique)\b');

/// `hasDocuments` : documents joints à CE message ; `conversationHasDocuments` :
/// un document a déjà été joint plus tôt dans la conversation.
CopilotLoadingPhase inferCopilotLoadingPhase(String message, {bool hasDocuments = false, bool conversationHasDocuments = false}) {
  final text = _fold(message);
  if (hasDocuments || _documentReference.hasMatch(text)) return CopilotLoadingPhase.document;
  if (conversationHasDocuments && _readingVerb.hasMatch(text)) return CopilotLoadingPhase.document;
  if (_actionRequest.hasMatch(text)) return CopilotLoadingPhase.action;
  return CopilotLoadingPhase.crm;
}
