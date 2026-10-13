// Les journaux de débogage ne doivent jamais contenir de jeton, de mot de
// passe ni de code : vérifie les fonctions de masquage de
// lib/providers/api_client.dart et l'absence de fuite dans le code. Aucun réseau.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:dash_master_toolkit/providers/api_client.dart';

const _jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.c2lnbmF0dXJlLWRlLXRlc3Q';

void main() {
  group('en-têtes', () {
    test('Authorization et Cookie sont masqués, le reste est conservé', () {
      final safe = debugSafeHeaders({'Authorization': 'Bearer $_jwt', 'cookie': 'refreshToken=$_jwt', 'Accept': 'application/json'});
      expect(safe['Authorization'], '[masqué]');
      expect(safe['cookie'], '[masqué]');
      expect(safe['Accept'], 'application/json');
      expect(safe.toString(), isNot(contains('eyJ')));
    });
  });

  group('corps', () {
    test('connexion : seuls les noms de champs sont listés', () {
      final out = debugSafeBody('/auth/signin', {'email': 'demo@exemple.tn', 'password': 'Secret-123!'}).toString();
      expect(out, contains('email'));
      expect(out, contains('password'));
      expect(out, isNot(contains('Secret-123!')));
      expect(out, isNot(contains('demo@exemple.tn')));
    });

    test('réponse de connexion : aucun jeton', () {
      final out = debugSafeBody('/auth/signin', {
        'accessToken': _jwt,
        'refreshToken': _jwt,
        'user': {'id': '1'},
      }).toString();
      expect(out, isNot(contains('eyJ')));
    });

    test('vérification MFA : ni code ni jeton de défi', () {
      final out = debugSafeBody('/auth/mfa/verify', {'otp': '123456', 'challengeToken': _jwt}).toString();
      expect(out, isNot(contains('123456')));
      expect(out, isNot(contains('eyJ')));
    });

    test('hors authentification : clés sensibles masquées à toute profondeur, données métier conservées', () {
      final out = debugSafeBody('/projects', {
        'nomProjet': 'DEMO Projet 001',
        'owner': {'email': 'a@b.tn', 'passwordHash': 'x', 'refreshTokenHash': 'y'},
        'items': [
          {'token': _jwt, 'statut': 'Prospect'},
        ],
      }).toString();
      expect(out, contains('DEMO Projet 001'));
      expect(out, contains('Prospect'));
      expect(out, isNot(contains('eyJ')));
      expect(out, contains('[masqué]'));
    });

    test('une valeur en forme de jeton est masquée même sous une clé anodine', () {
      expect(debugSafeBody('/divers', {'valeur': _jwt}).toString(), isNot(contains('eyJ')));
    });

    test('null reste null', () {
      expect(debugSafeBody('/projects', null), isNull);
    });
  });

  group('code source', () {
    // Un journal qui interpole une variable de jeton, ou qui en extrait un
    // fragment. Les tests de présence (isEmpty, == null, ??) sont admis.
    final interpolated = RegExp(r'(print|debugPrint)\(.*\$\{?(token|accessToken|refreshToken|jwt|authToken)\b(?!\s*(==|!=|\?\?|\.isEmpty|\.isNotEmpty))');
    final fragment = RegExp(r'(print|debugPrint)\(.*[Tt]oken.*\.substring\(');

    test("aucun journal n'interpole un jeton ni n'en extrait un fragment", () {
      final offenders = <String>[];
      final files = Directory('lib').listSync(recursive: true).whereType<File>().where((f) => f.path.endsWith('.dart'));
      for (final file in files) {
        final lines = file.readAsLinesSync();
        for (var i = 0; i < lines.length; i++) {
          final line = lines[i].trimLeft();
          if (line.startsWith('//')) continue;
          final unwrapped = line.replaceAll("(token ?? '')", 'presence');
          if (interpolated.hasMatch(unwrapped) || fragment.hasMatch(line)) offenders.add('${file.path}:${i + 1}');
        }
      }
      expect(offenders, isEmpty);
    });

    test('le client HTTP ne journalise plus les en-têtes ni les corps bruts', () {
      final source = File('lib/providers/api_client.dart').readAsStringSync();
      expect(source.contains('debugPrint("Headers: \${options.headers}")'), isFalse);
      expect(source.contains('debugPrint("Data: \${response.data}")'), isFalse);
      expect(source.contains('_safeHeaders(options.headers)'), isTrue);
    });
  });
}
