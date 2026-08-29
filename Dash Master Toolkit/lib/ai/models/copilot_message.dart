// lib/ai/models/copilot_message.dart
//
// Une bulle de conversation côté UI — PAS l'enveloppe brute du backend (voir
// copilot_response.dart pour ça). Un message utilisateur est local jusqu'à
// l'envoi ; un message assistant naît vide en statut `streaming` et se
// remplit chunk par chunk (voir CopilotController._handleChunk), puis passe
// `complete` avec la réponse complète attachée pour les citations/
// suggestions/explicabilité.
import 'package:uuid/uuid.dart';

import 'copilot_response.dart';

enum CopilotMessageRole { user, assistant }

enum CopilotMessageStatus { sending, streaming, complete, error }

class CopilotMessage {
  final String id;
  final CopilotMessageRole role;
  String text;
  final DateTime createdAt;
  CopilotMessageStatus status;
  CopilotResponse? response;

  CopilotMessage({
    required this.id,
    required this.role,
    required this.text,
    required this.createdAt,
    this.status = CopilotMessageStatus.complete,
    this.response,
  });

  bool get isUser => role == CopilotMessageRole.user;
  bool get isStreaming => status == CopilotMessageStatus.streaming;
  bool get isError => status == CopilotMessageStatus.error;

  factory CopilotMessage.user(String text) => CopilotMessage(
        id: const Uuid().v4(),
        role: CopilotMessageRole.user,
        text: text,
        createdAt: DateTime.now(),
        status: CopilotMessageStatus.complete,
      );

  // Créé immédiatement après l'envoi, avant même le premier événement
  // "typing" — remplace le placeholder par du vrai texte au fil des chunks
  // (ou de la réponse REST complète si le WebSocket n'est pas connecté).
  factory CopilotMessage.pendingAssistant() => CopilotMessage(
        id: const Uuid().v4(),
        role: CopilotMessageRole.assistant,
        text: '',
        createdAt: DateTime.now(),
        status: CopilotMessageStatus.streaming,
      );

  factory CopilotMessage.errorPlaceholder(String message) => CopilotMessage(
        id: const Uuid().v4(),
        role: CopilotMessageRole.assistant,
        text: message,
        createdAt: DateTime.now(),
        status: CopilotMessageStatus.error,
      );
}
