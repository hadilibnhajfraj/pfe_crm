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

  // Phase 2 — règles côté client (miroir de copilotDocumentValidation.js).
  group('CopilotAttachmentRules.validate', () {
    test('accepte les 5 formats, quelle que soit la casse de l''extension', () {
      for (final name in ['a.pdf', 'b.DOCX', 'c.xlsx', 'd.csv', 'e.Txt']) {
        expect(CopilotAttachmentRules.validate(fileName: name, sizeBytes: 10), isNull, reason: name);
      }
    });

    test('refuse les autres formats, et un fichier sans extension', () {
      for (final name in ['outil.exe', 'image.png', 'ancien.doc', 'archive.zip', 'sans_extension', 'point.']) {
        expect(CopilotAttachmentRules.validate(fileName: name, sizeBytes: 10), contains('Format non pris en charge'), reason: name);
      }
    });

    test('refuse un fichier vide et un fichier > 10 Mo (10 Mo pile accepté)', () {
      expect(CopilotAttachmentRules.validate(fileName: 'a.pdf', sizeBytes: 0), 'Le fichier est vide.');
      expect(CopilotAttachmentRules.validate(fileName: 'a.pdf', sizeBytes: 10 * 1024 * 1024), isNull);
      expect(CopilotAttachmentRules.validate(fileName: 'a.pdf', sizeBytes: 10 * 1024 * 1024 + 1), contains('10 Mo'));
    });
  });

  group('CopilotAttachment — états', () {
    const a = CopilotAttachment(id: '1', fileName: 'r.pdf', sizeBytes: 10);

    test('naît « en cours d''envoi », sans documentId', () {
      expect(a.isUploading, isTrue);
      expect(a.isReady, isFalse);
      expect(a.documentId, isNull);
    });

    test('asReady / asError conservent l''identité et le nom', () {
      final ready = a.asReady('doc-1');
      expect(ready.isReady, isTrue);
      expect(ready.documentId, 'doc-1');
      expect(ready.id, '1');
      final failed = a.asError('Format non pris en charge.');
      expect(failed.isError, isTrue);
      expect(failed.isReady, isFalse);
      expect(failed.errorMessage, 'Format non pris en charge.');
      expect(failed.fileName, 'r.pdf');
    });
  });
}
