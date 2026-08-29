// lib/ai/models/copilot_response.dart
//
// L'enveloppe RÉELLE renvoyée par POST /ai-copilot/chat (`data`) et par
// l'événement WebSocket `ai-copilot:complete` — les deux transports
// renvoient EXACTEMENT la même forme (voir
// Backend Master/src/modules/ai-copilot/AI_COPILOT_HTTP.md), donc un seul
// modèle suffit pour les deux. Reflète 1:1
// `src/ai/orchestrator/responseBuilder.js`, jamais un champ inventé.
import 'copilot_citation.dart';
import 'copilot_suggestion.dart';
import 'copilot_tool_call.dart';

class CopilotPendingAction {
  final String id;
  final List<CopilotPendingStep> steps;

  const CopilotPendingAction({required this.id, required this.steps});

  factory CopilotPendingAction.fromJson(Map<String, dynamic> j) {
    final rawSteps = j['steps'];
    return CopilotPendingAction(
      id: (j['id'] ?? '').toString(),
      steps: rawSteps is List
          ? rawSteps
              .whereType<Map>()
              .map((s) => CopilotPendingStep.fromJson(Map<String, dynamic>.from(s)))
              .toList()
          : const [],
    );
  }
}

class CopilotPendingStep {
  final String tool;
  final Map<String, dynamic> input;
  final String reason;

  const CopilotPendingStep({required this.tool, required this.input, required this.reason});

  factory CopilotPendingStep.fromJson(Map<String, dynamic> j) {
    return CopilotPendingStep(
      tool: (j['tool'] ?? '').toString(),
      input: j['input'] is Map ? Map<String, dynamic>.from(j['input'] as Map) : const {},
      reason: (j['reason'] ?? '').toString(),
    );
  }
}

class CopilotDataQualityWarning {
  final String? projectId;
  final String? projectName;
  final List<String> warnings;

  const CopilotDataQualityWarning({this.projectId, this.projectName, required this.warnings});

  factory CopilotDataQualityWarning.fromJson(Map<String, dynamic> j) {
    final rawWarnings = j['warnings'];
    return CopilotDataQualityWarning(
      projectId: j['projectId']?.toString(),
      projectName: j['projectName']?.toString(),
      warnings: rawWarnings is List ? rawWarnings.map((w) => w.toString()).toList() : const [],
    );
  }
}

class CopilotResponse {
  final String? conversationId;
  final String? intent;
  final String mode; // "agent" | "qa" | "tool_calling" | "clarification" | "error"
  final String? answer;
  final String? explanation;
  final Map<String, dynamic>? explainability;
  final CopilotPendingAction? pendingAction;
  final List<CopilotCitation> citations;
  final List<CopilotToolCall> toolCalls;
  final List<CopilotSuggestion> suggestions;
  final List<CopilotDataQualityWarning> dataQuality;
  final String? followUpQuestion;
  final String? agent;
  final DateTime? generatedAt;
  final String? errorMessage;

  const CopilotResponse({
    this.conversationId,
    this.intent,
    required this.mode,
    this.answer,
    this.explanation,
    this.explainability,
    this.pendingAction,
    this.citations = const [],
    this.toolCalls = const [],
    this.suggestions = const [],
    this.dataQuality = const [],
    this.followUpQuestion,
    this.agent,
    this.generatedAt,
    this.errorMessage,
  });

  bool get isError => mode == 'error';
  bool get isClarification => mode == 'clarification';
  bool get hasPendingAction => pendingAction != null && pendingAction!.steps.isNotEmpty;

  factory CopilotResponse.fromJson(Map<String, dynamic> j) {
    final rawCitations = j['citations'];
    final rawToolCalls = j['toolCalls'];
    final rawSuggestions = j['suggestions'];
    final rawDataQuality = j['dataQuality'];
    final rawError = j['error'];

    return CopilotResponse(
      conversationId: j['conversationId']?.toString(),
      intent: j['intent']?.toString(),
      mode: (j['mode'] ?? 'agent').toString(),
      answer: j['answer']?.toString(),
      explanation: j['explanation']?.toString(),
      explainability: j['explainability'] is Map ? Map<String, dynamic>.from(j['explainability'] as Map) : null,
      pendingAction: j['pendingAction'] is Map ? CopilotPendingAction.fromJson(Map<String, dynamic>.from(j['pendingAction'] as Map)) : null,
      citations: rawCitations is List
          ? rawCitations.whereType<Map>().map((c) => CopilotCitation.fromJson(Map<String, dynamic>.from(c))).toList()
          : const [],
      toolCalls: rawToolCalls is List
          ? rawToolCalls.whereType<Map>().map((t) => CopilotToolCall.fromJson(Map<String, dynamic>.from(t))).toList()
          : const [],
      suggestions: rawSuggestions is List
          ? rawSuggestions.whereType<Map>().map((s) => CopilotSuggestion.fromJson(Map<String, dynamic>.from(s))).toList()
          : const [],
      dataQuality: rawDataQuality is List
          ? rawDataQuality.whereType<Map>().map((d) => CopilotDataQualityWarning.fromJson(Map<String, dynamic>.from(d))).toList()
          : const [],
      followUpQuestion: j['followUpQuestion']?.toString(),
      agent: j['agent']?.toString(),
      generatedAt: _date(j['generatedAt']),
      errorMessage: rawError is Map ? rawError['message']?.toString() : null,
    );
  }

  static DateTime? _date(dynamic v) {
    if (v == null) return null;
    try {
      return DateTime.parse(v.toString());
    } catch (_) {
      return null;
    }
  }
}
