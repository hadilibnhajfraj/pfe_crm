// lib/ai/services/copilot_voice_service.dart
//
// ARCHITECTURE UNIQUEMENT. Aucun package de reconnaissance vocale
// (speech_to_text, record, ...) n'est ajouté par cette passe — le projet
// n'en avait aucun avant (voir l'audit de pubspec.yaml), et en ajouter un
// engage des permissions plateforme (micro) et un build natif qui doivent
// rester un choix produit explicite, pas une conséquence silencieuse de
// "créer le bouton vocal". Ce service définit le CONTRAT que
// CopilotVoiceButton attend déjà (voir widgets/copilot_voice_button.dart) :
// le jour où la reconnaissance vocale est activée, seule cette classe
// change — aucun widget ne bouge.
enum CopilotVoiceState { idle, listening, unavailable }

abstract class ICopilotVoiceService {
  bool get isAvailable;
  Stream<CopilotVoiceState> get stateStream;

  Future<void> startListening({required void Function(String transcript) onResult});
  Future<void> stopListening();
}

/// Implémentation par défaut — toujours indisponible, ne demande jamais de
/// permission micro, ne fait jamais planter l'appelant. `startListening()`
/// notifie immédiatement `unavailable` plutôt que de rester silencieusement
/// bloqué, pour que l'UI puisse afficher un message clair ("Bientôt
/// disponible") au lieu d'un bouton qui ne répond pas.
class UnavailableCopilotVoiceService implements ICopilotVoiceService {
  @override
  bool get isAvailable => false;

  @override
  Stream<CopilotVoiceState> get stateStream => Stream.value(CopilotVoiceState.unavailable);

  @override
  Future<void> startListening({required void Function(String transcript) onResult}) async {
    // Architecture uniquement — voir le commentaire d'en-tête de ce fichier.
  }

  @override
  Future<void> stopListening() async {}
}
