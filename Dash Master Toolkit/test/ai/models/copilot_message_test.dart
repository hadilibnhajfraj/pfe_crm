import 'package:flutter_test/flutter_test.dart';
import 'package:dash_master_toolkit/ai/models/copilot_message.dart';

void main() {
  group('CopilotMessage factories', () {
    test('.user() creates a complete, non-streaming user message', () {
      final msg = CopilotMessage.user('Bonjour');
      expect(msg.role, CopilotMessageRole.user);
      expect(msg.isUser, isTrue);
      expect(msg.text, 'Bonjour');
      expect(msg.status, CopilotMessageStatus.complete);
      expect(msg.isStreaming, isFalse);
      expect(msg.isError, isFalse);
      expect(msg.id, isNotEmpty);
    });

    test('.pendingAssistant() creates an empty, streaming assistant message', () {
      final msg = CopilotMessage.pendingAssistant();
      expect(msg.role, CopilotMessageRole.assistant);
      expect(msg.isUser, isFalse);
      expect(msg.text, isEmpty);
      expect(msg.isStreaming, isTrue);
    });

    test('.errorPlaceholder() creates an error-status assistant message carrying the message text', () {
      final msg = CopilotMessage.errorPlaceholder('Une erreur est survenue.');
      expect(msg.role, CopilotMessageRole.assistant);
      expect(msg.isError, isTrue);
      expect(msg.text, 'Une erreur est survenue.');
    });

    test('two messages created back to back never share an id', () {
      final a = CopilotMessage.user('a');
      final b = CopilotMessage.user('b');
      expect(a.id, isNot(equals(b.id)));
    });

    test('text is mutable — appending chunks during streaming works', () {
      final msg = CopilotMessage.pendingAssistant();
      msg.text += 'Bon';
      msg.text += 'jour';
      expect(msg.text, 'Bonjour');
    });
  });
}
