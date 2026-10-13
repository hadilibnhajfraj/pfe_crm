// lib/powerbi/powerbi_embed_host_web.dart — cible web uniquement.
//
// Utilise uniquement des bibliothèques du SDK (dart:js_interop, dart:ui_web) :
// aucune dépendance ajoutée à pubspec.yaml. La bibliothèque JavaScript
// powerbi-client n'est chargée qu'à l'ouverture de l'écran, pas au démarrage
// de l'application.
import 'dart:async';
import 'dart:js_interop';
import 'dart:js_interop_unsafe';
import 'dart:ui_web' as ui_web;

import 'package:flutter/widgets.dart';

import 'powerbi_embed_host.dart';
import 'powerbi_embed_service.dart';

const _scriptUrl = 'https://cdn.jsdelivr.net/npm/powerbi-client@2.23.1/dist/powerbi.min.js';

@JS('document')
external JSObject get _document;

PowerBiEmbedHost createHost() => _WebHost();

int _nextViewId = 0;
Future<void>? _scriptLoading;

Future<void> _ensureScript() {
  if (globalContext.has('powerbi')) return Future.value();
  return _scriptLoading ??= () {
    final done = Completer<void>();
    final script = _document.callMethod<JSObject>('createElement'.toJS, 'script'.toJS);
    script.setProperty('src'.toJS, _scriptUrl.toJS);
    script.setProperty('onload'.toJS, (() => done.complete()).toJS);
    script.setProperty(
      'onerror'.toJS,
      (() {
        _scriptLoading = null;
        done.completeError(const PowerBiEmbedException(PowerBiEmbedFailure.unavailable, 'Impossible de charger le composant Power BI.'));
      }).toJS,
    );
    _document.getProperty<JSObject>('head'.toJS).callMethod<JSAny?>('appendChild'.toJS, script);
    return done.future;
  }();
}

class _WebHost implements PowerBiEmbedHost {
  _WebHost() : _viewType = 'crm-powerbi-embed-${_nextViewId++}' {
    _container = _document.callMethod<JSObject>('createElement'.toJS, 'div'.toJS);
    final style = _container.getProperty<JSObject>('style'.toJS);
    style.setProperty('width'.toJS, '100%'.toJS);
    style.setProperty('height'.toJS, '100%'.toJS);
    style.setProperty('border'.toJS, '0'.toJS);
    ui_web.platformViewRegistry.registerViewFactory(_viewType, (int _) => _container);
  }

  final String _viewType;
  late final JSObject _container;
  JSObject? _report;

  @override
  bool get isSupported => true;

  @override
  Widget buildView() => HtmlElementView(viewType: _viewType);

  @override
  Future<void> load(PowerBiEmbedConfig config) async {
    await _ensureScript();
    reset();
    final settings = <String, Object?>{
      'type': 'report',
      'id': config.reportId,
      'embedUrl': config.embedUrl,
      'accessToken': config.embedToken,
      'tokenType': 1, // models.TokenType.Embed
      'permissions': 0, // lecture seule
      'settings': {
        'panes': {
          'filters': {'visible': false},
          'pageNavigation': {'visible': config.isGlobal},
        },
      },
    };
    final service = globalContext.getProperty<JSObject>('powerbi'.toJS);
    _report = service.callMethod<JSObject>('embed'.toJS, _container, settings.jsify());
  }

  @override
  Future<void> updateToken(String embedToken) async {
    final report = _report;
    if (report == null) return;
    await report.callMethod<JSPromise<JSAny?>>('setAccessToken'.toJS, embedToken.toJS).toDart;
  }

  @override
  void reset() {
    if (_report == null && !globalContext.has('powerbi')) return;
    if (globalContext.has('powerbi')) {
      globalContext.getProperty<JSObject>('powerbi'.toJS).callMethod<JSAny?>('reset'.toJS, _container);
    }
    _report = null;
  }
}
