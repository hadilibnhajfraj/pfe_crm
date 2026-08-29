import 'package:flutter_test/flutter_test.dart';
import 'package:dash_master_toolkit/ai/models/copilot_attachment.dart';

void main() {
  group('CopilotAttachment.sizeLabel', () {
    test('bytes under 1 Ko are shown in octets', () {
      const a = CopilotAttachment(id: '1', fileName: 'x.txt', sizeBytes: 500);
      expect(a.sizeLabel, '500 o');
    });

    test('kilobytes are shown with 1 decimal', () {
      const a = CopilotAttachment(id: '1', fileName: 'x.pdf', sizeBytes: 2048);
      expect(a.sizeLabel, '2.0 Ko');
    });

    test('megabytes are shown with 1 decimal', () {
      const a = CopilotAttachment(id: '1', fileName: 'x.pdf', sizeBytes: 5 * 1024 * 1024);
      expect(a.sizeLabel, '5.0 Mo');
    });
  });
}
