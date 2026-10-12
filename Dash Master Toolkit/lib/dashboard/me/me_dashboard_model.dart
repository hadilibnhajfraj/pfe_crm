// Modèles de la réponse GET /dashboard/me (tableau de bord personnalisé).
//
// Tout ce qui est affiché vient du serveur : profil, modules, indicateurs,
// filtres et limites. L'application ne déduit rien du rôle stocké localement.

class MeProfile {
  final String id;
  final String email;
  final String? displayName;
  final String role;
  final String roleLabel;
  final String key;

  const MeProfile({
    required this.id,
    required this.email,
    required this.displayName,
    required this.role,
    required this.roleLabel,
    required this.key,
  });

  factory MeProfile.fromJson(Map<String, dynamic> json) => MeProfile(
        id: (json['id'] ?? '').toString(),
        email: (json['email'] ?? '').toString(),
        displayName: _text(json['displayName']),
        role: (json['role'] ?? '').toString(),
        roleLabel: (json['roleLabel'] ?? json['role'] ?? '').toString(),
        key: (json['key'] ?? '').toString(),
      );

  String get title => (displayName != null && displayName!.isNotEmpty) ? displayName! : email;
}

class MeModule {
  final String key;
  final String label;

  const MeModule({required this.key, required this.label});

  factory MeModule.fromJson(Map<String, dynamic> json) =>
      MeModule(key: (json['key'] ?? '').toString(), label: (json['label'] ?? '').toString());
}

class MeKpi {
  final String key;
  final String label;

  /// `null` quand le serveur n'a pas de valeur : affiché « — », jamais 0.
  final num? value;
  final String? unit;
  final String format;
  final String group;

  const MeKpi({
    required this.key,
    required this.label,
    required this.value,
    required this.unit,
    required this.format,
    required this.group,
  });

  factory MeKpi.fromJson(Map<String, dynamic> json) {
    final raw = json['value'];
    return MeKpi(
      key: (json['key'] ?? '').toString(),
      label: (json['label'] ?? '').toString(),
      value: raw is num ? raw : (raw is String ? num.tryParse(raw) : null),
      unit: _text(json['unit']),
      format: (json['format'] ?? 'integer').toString(),
      group: (json['group'] ?? '').toString(),
    );
  }

  /// Valeur prête à afficher, sans l'unité (portée par [unit]).
  String get displayValue {
    final v = value;
    if (v == null) return '—';
    if (format == 'integer') return _thousands(v.round().toString());
    final fixed = v.toStringAsFixed(format == 'percent' ? 1 : 2);
    final parts = fixed.split('.');
    final decimals = parts[1].replaceFirst(RegExp(r'0+$'), '');
    return decimals.isEmpty ? _thousands(parts[0]) : '${_thousands(parts[0])},$decimals';
  }
}

class MeFilterOption {
  final String value;
  final String label;

  const MeFilterOption({required this.value, required this.label});
}

class MeFilter {
  final String key;
  final String label;
  final List<MeFilterOption> options;
  final String? value;

  const MeFilter({required this.key, required this.label, required this.options, required this.value});

  factory MeFilter.fromJson(Map<String, dynamic> json) => MeFilter(
        key: (json['key'] ?? '').toString(),
        label: (json['label'] ?? '').toString(),
        options: _list(json['options'])
            .map((o) => MeFilterOption(value: (o['value'] ?? '').toString(), label: (o['label'] ?? '').toString()))
            .toList(),
        value: _text(json['value']) ?? _text(json['default']),
      );
}

class MeDashboard {
  final MeProfile profile;
  final List<MeModule> modules;
  final List<MeKpi> kpis;
  final List<MeFilter> filters;
  final List<String> limitations;
  final DateTime? generatedAt;

  const MeDashboard({
    required this.profile,
    required this.modules,
    required this.kpis,
    required this.filters,
    required this.limitations,
    required this.generatedAt,
  });

  /// Accepte la réponse complète `{ success, data }` ou directement `data`.
  factory MeDashboard.fromJson(Map<String, dynamic> json) {
    final data = json['data'] is Map ? Map<String, dynamic>.from(json['data'] as Map) : json;
    final profile = data['profile'];
    if (profile is! Map) throw const FormatException('Réponse sans profil');
    final freshness = data['freshness'] is Map ? Map<String, dynamic>.from(data['freshness'] as Map) : const <String, dynamic>{};
    return MeDashboard(
      profile: MeProfile.fromJson(Map<String, dynamic>.from(profile)),
      modules: _list(data['modules']).map(MeModule.fromJson).toList(),
      kpis: _list(data['kpis']).map(MeKpi.fromJson).toList(),
      filters: _list(data['filters']).map(MeFilter.fromJson).toList(),
      limitations: (data['limitations'] is List ? data['limitations'] as List : const []).map((e) => e.toString()).toList(),
      generatedAt: DateTime.tryParse((freshness['generatedAt'] ?? '').toString())?.toLocal(),
    );
  }

  /// Indicateurs regroupés, dans l'ordre d'arrivée des groupes.
  Map<String, List<MeKpi>> get kpisByGroup {
    final groups = <String, List<MeKpi>>{};
    for (final kpi in kpis) {
      groups.putIfAbsent(kpi.group, () => <MeKpi>[]).add(kpi);
    }
    return groups;
  }
}

String? _text(dynamic value) {
  if (value == null) return null;
  final text = value.toString().trim();
  return text.isEmpty ? null : text;
}

List<Map<String, dynamic>> _list(dynamic value) {
  if (value is! List) return const [];
  return value.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
}

String _thousands(String digits) {
  final negative = digits.startsWith('-');
  final body = negative ? digits.substring(1) : digits;
  final buffer = StringBuffer();
  for (var i = 0; i < body.length; i++) {
    if (i > 0 && (body.length - i) % 3 == 0) buffer.write(' ');
    buffer.write(body[i]);
  }
  return negative ? '-$buffer' : buffer.toString();
}
