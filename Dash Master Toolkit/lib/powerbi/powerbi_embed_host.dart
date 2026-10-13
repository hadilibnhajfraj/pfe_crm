// lib/powerbi/powerbi_embed_host.dart
//
// Hôte du rapport intégré. L'implémentation réelle n'existe que pour le web
// (cadre HTML + bibliothèque JavaScript powerbi-client) ; les autres cibles
// reçoivent une implémentation neutre, pour ne pas casser leur compilation.
import 'package:flutter/widgets.dart';

import 'powerbi_embed_service.dart';
import 'powerbi_embed_host_stub.dart' if (dart.library.js_interop) 'powerbi_embed_host_web.dart' as impl;

abstract class PowerBiEmbedHost {
  /// Vrai si la cible sait afficher un rapport intégré.
  bool get isSupported;

  /// Zone d'affichage du rapport.
  Widget buildView();

  /// Charge le rapport avec le jeton reçu du serveur.
  Future<void> load(PowerBiEmbedConfig config);

  /// Remplace le jeton avant son expiration, sans recharger le rapport.
  Future<void> updateToken(String embedToken);

  /// Détruit le rapport affiché et oublie le jeton (déconnexion, changement de compte).
  void reset();
}

PowerBiEmbedHost createPowerBiEmbedHost() => impl.createHost();
