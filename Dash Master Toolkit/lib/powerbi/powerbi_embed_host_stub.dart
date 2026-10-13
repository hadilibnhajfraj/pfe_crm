// lib/powerbi/powerbi_embed_host_stub.dart — cibles autres que le web.
import 'package:flutter/widgets.dart';

import 'powerbi_embed_host.dart';
import 'powerbi_embed_service.dart';

PowerBiEmbedHost createHost() => _UnsupportedHost();

class _UnsupportedHost implements PowerBiEmbedHost {
  @override
  bool get isSupported => false;

  @override
  Widget buildView() => const SizedBox.shrink();

  @override
  Future<void> load(PowerBiEmbedConfig config) async {}

  @override
  Future<void> updateToken(String embedToken) async {}

  @override
  void reset() {}
}
