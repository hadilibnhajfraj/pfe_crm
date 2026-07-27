// lib/application/users/model/commercial_analytics_model.dart
//
// Modèle de réponse pour GET /commercial-contacts/analytics

import 'commercial_contact_model.dart';

class CommercialAnalyticsModel {
  final int    totalContacts;
  final int    totalCalls;
  final int    totalCompanies;
  final int    totalCommerciaux;
  final int    totalActifs;
  final int    totalNonValides;

  final List<StatutCount>      contactsByStatut;
  final List<TypeCount>        contactsByType;
  final List<CommercialCount>  contactsByCommercial;
  final List<CompanyCount>     topCompanies;
  final List<MonthlyCount>     monthlyActivity;

  const CommercialAnalyticsModel({
    required this.totalContacts,
    required this.totalCalls,
    required this.totalCompanies,
    required this.totalCommerciaux,
    required this.totalActifs,
    required this.totalNonValides,
    required this.contactsByStatut,
    required this.contactsByType,
    required this.contactsByCommercial,
    required this.topCompanies,
    required this.monthlyActivity,
  });

  // ── Construit les analytics à partir de la liste brute des contacts ─────────
  // Utilisé comme fallback quand GET /commercial-contacts/analytics n'existe pas.
  factory CommercialAnalyticsModel.fromContacts(
      List<CommercialContact> contacts) {
    bool isActif(String s) {
      final l = s.toLowerCase().trim();
      return l == 'ok' || l == 'client' || (l.contains('valid') && !l.contains('non'));
    }
    bool isNonValide(String s) {
      final l = s.toLowerCase().trim();
      return l.contains('non') || l.contains('refus') || l.contains('perdu');
    }

    // KPIs
    final totalCalls = contacts.fold(0, (s, c) => s + c.nbAppels);
    final compSet    = <String>{};
    for (final c in contacts) {
      if ((c.nomSociete ?? '').trim().isNotEmpty) compSet.add(c.nomSociete!.trim());
    }
    final actifs     = contacts.where((c) => isActif(c.statut)).length;
    final nonValides = contacts.where((c) => isNonValide(c.statut)).length;

    // Statut
    final sCounts = <String, int>{};
    for (final c in contacts) {
      final s = c.statut.trim().isEmpty ? 'Inconnu' : c.statut.trim();
      sCounts[s] = (sCounts[s] ?? 0) + 1;
    }

    // Type
    final tCounts = <String, int>{};
    for (final c in contacts) {
      final t = c.typeClient.trim().isEmpty ? 'Autre' : c.typeClient.trim();
      tCounts[t] = (tCounts[t] ?? 0) + 1;
    }

    // By commercial
    final byUser = <String, List<CommercialContact>>{};
    for (final c in contacts) {
      final name =
          (c.userNomCustom?.trim().isNotEmpty == true ? c.userNomCustom : c.userNom)
              ?.trim() ?? 'Non assigné';
      byUser.putIfAbsent(name, () => []).add(c);
    }
    final byCommercial = byUser.entries.map((e) {
      final list   = e.value;
      final eSet   = <String>{};
      for (final c in list) {
        if ((c.nomSociete ?? '').trim().isNotEmpty) eSet.add(c.nomSociete!.trim());
      }
      return CommercialCount(
        commercial:  e.key,
        contacts:    list.length,
        calls:       list.fold(0, (s, c) => s + c.nbAppels),
        actifs:      list.where((c) => isActif(c.statut)).length,
        nonValides:  list.where((c) => isNonValide(c.statut)).length,
        entreprises: eSet.length,
      );
    }).toList()
      ..sort((a, b) => b.contacts.compareTo(a.contacts));

    // By company
    final byComp = <String, List<CommercialContact>>{};
    for (final c in contacts) {
      final name = (c.nomSociete ?? '').trim();
      if (name.isEmpty) continue;
      byComp.putIfAbsent(name, () => []).add(c);
    }
    final companies = byComp.entries.map((e) => CompanyCount(
          name:     e.key,
          contacts: e.value.length,
          calls:    e.value.fold(0, (s, c) => s + c.nbAppels),
        )).toList()
          ..sort((a, b) => b.contacts.compareTo(a.contacts));

    // Monthly (last 12 months)
    final now    = DateTime.now();
    const months = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
    final monthly = List.generate(12, (i) {
      final month = DateTime(now.year, now.month - 11 + i, 1);
      final list  = contacts.where((c) {
        final d = c.createdAt;
        return d != null && d.year == month.year && d.month == month.month;
      }).toList();
      return MonthlyCount(
        month:    months[month.month - 1],
        contacts: list.length,
        calls:    list.fold(0, (s, c) => s + c.nbAppels),
      );
    });

    return CommercialAnalyticsModel(
      totalContacts:         contacts.length,
      totalCalls:            totalCalls,
      totalCompanies:        compSet.length,
      totalCommerciaux:      byUser.length,
      totalActifs:           actifs,
      totalNonValides:       nonValides,
      contactsByStatut:      sCounts.entries
          .map((e) => StatutCount(statut: e.key, count: e.value))
          .toList()
            ..sort((a, b) => b.count.compareTo(a.count)),
      contactsByType:        tCounts.entries
          .where((e) => e.value > 0)
          .map((e) => TypeCount(type: e.key, count: e.value))
          .toList()
            ..sort((a, b) => b.count.compareTo(a.count)),
      contactsByCommercial:  byCommercial,
      topCompanies:          companies.take(10).toList(),
      monthlyActivity:       monthly,
    );
  }

  // ── Parseurs flexibles (Map ou List, clés alternatives) ────────────────────

  static List<StatutCount> _parseStatuts(dynamic raw) {
    if (raw == null) return [];
    if (raw is List) {
      return raw.map((e) => StatutCount.fromJson(e as Map<String, dynamic>)).toList();
    }
    if (raw is Map) {
      return (raw.entries
          .map((e) => StatutCount(statut: e.key.toString(), count: (e.value as num).toInt()))
          .toList()
        ..sort((a, b) => b.count.compareTo(a.count)));
    }
    return [];
  }

  static List<TypeCount> _parseTypes(dynamic raw) {
    if (raw == null) return [];
    if (raw is List) {
      return raw.map((e) => TypeCount.fromJson(e as Map<String, dynamic>)).toList();
    }
    if (raw is Map) {
      return (raw.entries
          .map((e) => TypeCount(type: e.key.toString(), count: (e.value as num).toInt()))
          .toList()
        ..sort((a, b) => b.count.compareTo(a.count)));
    }
    return [];
  }

  static List<CommercialCount> _parseCommercials(dynamic raw) {
    if (raw == null || raw is! List) return [];
    return raw.map((e) => CommercialCount.fromJson(e as Map<String, dynamic>)).toList();
  }

  static List<CompanyCount> _parseCompanies(dynamic raw) {
    if (raw == null || raw is! List) return [];
    return raw.map((e) => CompanyCount.fromJson(e as Map<String, dynamic>)).toList();
  }

  static List<MonthlyCount> _parseMonthly(dynamic raw) {
    if (raw == null || raw is! List) return [];
    return raw.map((e) => MonthlyCount.fromJson(e as Map<String, dynamic>)).toList();
  }

  factory CommercialAnalyticsModel.fromJson(Map<String, dynamic> j) =>
      CommercialAnalyticsModel(
        totalContacts:    (j['totalContacts']    as num? ?? 0).toInt(),
        totalCalls:       (j['totalCalls']       as num? ?? 0).toInt(),
        // accepte totalCompanies OU totalEntreprises
        totalCompanies:   ((j['totalCompanies']  ?? j['totalEntreprises']) as num? ?? 0).toInt(),
        totalCommerciaux: (j['totalCommerciaux'] as num? ?? 0).toInt(),
        totalActifs:      (j['totalActifs']      as num? ?? 0).toInt(),
        totalNonValides:  (j['totalNonValides']  as num? ?? 0).toInt(),
        // accepte contactsByStatut OU contactsByStatus — Map ou List
        contactsByStatut:    _parseStatuts(j['contactsByStatut'] ?? j['contactsByStatus']),
        // accepte Map ou List
        contactsByType:      _parseTypes(j['contactsByType']),
        contactsByCommercial: _parseCommercials(j['contactsByCommercial']),
        topCompanies:        _parseCompanies(j['topCompanies']),
        // accepte monthlyActivity OU monthly
        monthlyActivity:     _parseMonthly(j['monthlyActivity'] ?? j['monthly']),
      );

  Map<String, dynamic> toJson() => {
        'totalContacts':         totalContacts,
        'totalCalls':            totalCalls,
        'totalCompanies':        totalCompanies,
        'totalCommerciaux':      totalCommerciaux,
        'totalActifs':           totalActifs,
        'totalNonValides':       totalNonValides,
        'contactsByStatut':      contactsByStatut.map((e) => e.toJson()).toList(),
        'contactsByType':        contactsByType.map((e) => e.toJson()).toList(),
        'contactsByCommercial':  contactsByCommercial.map((e) => e.toJson()).toList(),
        'topCompanies':          topCompanies.map((e) => e.toJson()).toList(),
        'monthlyActivity':       monthlyActivity.map((e) => e.toJson()).toList(),
      };
}

// ─────────────────────────────────────────────────────────────────────────────

class StatutCount {
  final String statut;
  final int    count;
  const StatutCount({required this.statut, required this.count});

  factory StatutCount.fromJson(Map<String, dynamic> j) => StatutCount(
        statut: j['statut'] as String? ?? '',
        count:  (j['count'] as num? ?? 0).toInt(),
      );
  Map<String, dynamic> toJson() => {'statut': statut, 'count': count};
}

class TypeCount {
  final String type;
  final int    count;
  const TypeCount({required this.type, required this.count});

  factory TypeCount.fromJson(Map<String, dynamic> j) => TypeCount(
        type:  j['type']  as String? ?? j['typeClient'] as String? ?? '',
        count: (j['count'] as num? ?? 0).toInt(),
      );
  Map<String, dynamic> toJson() => {'type': type, 'count': count};
}

class CommercialCount {
  final String commercial;
  final int    contacts;
  final int    calls;
  final int    actifs;
  final int    nonValides;
  final int    entreprises;

  const CommercialCount({
    required this.commercial,
    required this.contacts,
    required this.calls,
    this.actifs      = 0,
    this.nonValides  = 0,
    this.entreprises = 0,
  });

  factory CommercialCount.fromJson(Map<String, dynamic> j) => CommercialCount(
        commercial:   j['commercial']   as String? ?? j['userNom'] as String? ?? '',
        contacts:     (j['contacts']    as num? ?? 0).toInt(),
        calls:        (j['calls']       as num? ?? j['nbAppels'] as num? ?? 0).toInt(),
        actifs:       (j['actifs']      as num? ?? 0).toInt(),
        nonValides:   (j['nonValides']  as num? ?? 0).toInt(),
        entreprises:  (j['entreprises'] as num? ?? 0).toInt(),
      );
  Map<String, dynamic> toJson() => {
        'commercial':  commercial,
        'contacts':    contacts,
        'calls':       calls,
        'actifs':      actifs,
        'nonValides':  nonValides,
        'entreprises': entreprises,
      };
}

class CompanyCount {
  final String name;
  final int    contacts;
  final int    calls;
  const CompanyCount(
      {required this.name, required this.contacts, required this.calls});

  factory CompanyCount.fromJson(Map<String, dynamic> j) => CompanyCount(
        name:     j['name']     as String? ?? j['nomSociete'] as String? ?? '',
        contacts: (j['contacts'] as num? ?? 0).toInt(),
        calls:    (j['calls']    as num? ?? 0).toInt(),
      );
  Map<String, dynamic> toJson() =>
      {'name': name, 'contacts': contacts, 'calls': calls};
}

class MonthlyCount {
  final String month;
  final int    contacts;
  final int    calls;
  const MonthlyCount(
      {required this.month, required this.contacts, required this.calls});

  factory MonthlyCount.fromJson(Map<String, dynamic> j) => MonthlyCount(
        month:    j['month'] as String? ?? '',
        contacts: (j['contacts'] as num? ?? 0).toInt(),
        calls:    (j['calls']    as num? ?? 0).toInt(),
      );
  Map<String, dynamic> toJson() =>
      {'month': month, 'contacts': contacts, 'calls': calls};
}
