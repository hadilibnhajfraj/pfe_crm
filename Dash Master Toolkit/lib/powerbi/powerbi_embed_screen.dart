// lib/powerbi/powerbi_embed_screen.dart
//
// Écran du rapport Power BI intégré. Non relié au menu ni au routeur tant que
// l'intégration Microsoft n'est pas configurée et validée (voir
// Backend Master/reports/demo-readiness/POWERBI-EMBED-LIVRAISON.md).
//
// L'en-tête affiche l'identité renvoyée par le SERVEUR, jamais celle stockée
// localement. Le filtrage des données est assuré par la RLS du modèle ; cet
// écran n'applique aucun filtre de sécurité.
import 'dart:async';

import 'package:flutter/material.dart';

import 'package:dash_master_toolkit/providers/auth_service.dart';
import 'powerbi_embed_host.dart';
import 'powerbi_embed_service.dart';

class PowerBiEmbedScreen extends StatefulWidget {
  const PowerBiEmbedScreen({super.key, this.service, this.host, this.currentUserId, this.renewBefore = const Duration(minutes: 3)});

  final PowerBiEmbedService? service;
  final PowerBiEmbedHost? host;

  /// Identifiant de la session courante ; sert uniquement à détecter un
  /// changement de compte, il n'est jamais envoyé au serveur.
  final String? Function()? currentUserId;

  /// Marge avant l'expiration du jeton pour en demander un nouveau.
  final Duration renewBefore;

  @override
  State<PowerBiEmbedScreen> createState() => _PowerBiEmbedScreenState();
}

class _PowerBiEmbedScreenState extends State<PowerBiEmbedScreen> {
  late final PowerBiEmbedService _service = widget.service ?? PowerBiEmbedService();
  late final PowerBiEmbedHost _host = widget.host ?? createPowerBiEmbedHost();

  PowerBiEmbedConfig? _config;
  PowerBiEmbedException? _error;
  bool _loading = true;
  String? _loadedForUser;
  Timer? _renewTimer;

  String? get _sessionUser => widget.currentUserId != null ? widget.currentUserId!() : AuthService().userId;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant PowerBiEmbedScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Changement de compte : le contexte précédent est détruit avant tout rechargement.
    if (_sessionUser != _loadedForUser) _load();
  }

  @override
  void dispose() {
    _renewTimer?.cancel();
    _host.reset();
    super.dispose();
  }

  Future<void> _load() async {
    _renewTimer?.cancel();
    _host.reset();
    final user = _sessionUser;
    setState(() {
      _loading = true;
      _error = null;
      _config = null;
      _loadedForUser = user;
    });
    if (!_host.isSupported) {
      setState(() {
        _loading = false;
        _error = const PowerBiEmbedException(PowerBiEmbedFailure.unavailable, "Le rapport intégré n'est disponible que dans la version web.");
      });
      return;
    }
    try {
      final config = await _service.fetchEmbedConfig();
      if (!mounted || _sessionUser != user) return; // réponse d'une session précédente : ignorée
      await _host.load(config);
      if (!mounted) return;
      setState(() {
        _config = config;
        _loading = false;
      });
      _scheduleRenewal(config);
    } on PowerBiEmbedException catch (e) {
      if (!mounted) return;
      _host.reset();
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  void _scheduleRenewal(PowerBiEmbedConfig config) {
    final wait = config.expiresAt.difference(DateTime.now().toUtc()) - widget.renewBefore;
    _renewTimer = Timer(wait.isNegative ? Duration.zero : wait, _renew);
  }

  Future<void> _renew() async {
    final user = _loadedForUser;
    try {
      final fresh = await _service.fetchEmbedConfig();
      if (!mounted || _sessionUser != user) return;
      await _host.updateToken(fresh.embedToken);
      setState(() => _config = fresh);
      _scheduleRenewal(fresh);
    } on PowerBiEmbedException catch (e) {
      if (!mounted) return;
      _host.reset();
      setState(() {
        _config = null;
        _error = e;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final config = _config;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Header(label: config?.viewerLabel ?? '', isGlobal: config?.isGlobal ?? false),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _error != null
                  ? _ErrorState(error: _error!, onRetry: _error!.failure == PowerBiEmbedFailure.unavailable && _host.isSupported ? _load : null)
                  : _host.buildView(),
        ),
      ],
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.label, required this.isGlobal});

  final String label;
  final bool isGlobal;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(color: theme.colorScheme.surface, border: Border(bottom: BorderSide(color: theme.dividerColor))),
      child: Row(
        children: [
          Icon(isGlobal ? Icons.public : Icons.person_outline, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              label.isEmpty ? 'Rapport Power BI' : label,
              key: const ValueKey('powerbi-viewer-label'),
              style: theme.textTheme.titleSmall,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          const Text('Données de démonstration', style: TextStyle(fontSize: 12)),
        ],
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.error, this.onRetry});

  final PowerBiEmbedException error;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(error.failure == PowerBiEmbedFailure.notConfigured ? Icons.settings_outlined : Icons.lock_outline, size: 36),
          const SizedBox(height: 12),
          Text(error.message, key: const ValueKey('powerbi-error'), textAlign: TextAlign.center),
          if (onRetry != null) ...[
            const SizedBox(height: 12),
            OutlinedButton(onPressed: onRetry, child: const Text('Réessayer')),
          ],
        ],
      ),
    );
  }
}
