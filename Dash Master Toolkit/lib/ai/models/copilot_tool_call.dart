// lib/ai/models/copilot_tool_call.dart
//
// Un AI Tool (MCP) réellement appelé pour construire la réponse — partie de
// l'explicabilité (`toolCalls`, voir orchestrator/explainabilityBuilder.js).
// Affiché dans le panneau "Pourquoi cette réponse ?", jamais dans la bulle
// de conversation elle-même.
class CopilotToolCall {
  final String tool;
  final Map<String, dynamic> input;
  final dynamic output;

  const CopilotToolCall({
    required this.tool,
    required this.input,
    required this.output,
  });

  factory CopilotToolCall.fromJson(Map<String, dynamic> j) {
    return CopilotToolCall(
      tool: (j['tool'] ?? '').toString(),
      input: j['input'] is Map ? Map<String, dynamic>.from(j['input'] as Map) : const {},
      output: j['output'],
    );
  }
}
