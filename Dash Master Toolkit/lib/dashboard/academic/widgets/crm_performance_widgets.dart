// lib/dashboard/academic/widgets/crm_performance_widgets.dart
// Dashboard CRM décisionnel — anti-overflow · score · explications dynamiques

import 'package:flutter/material.dart';

// ─────────────────────────────────────────────────────────────────────────────
// TOKENS
// ─────────────────────────────────────────────────────────────────────────────
const _kCard   = Colors.white;
const _kBorder = Color(0xFFE2E8F0);
const _kText   = Color(0xFF0F172A);
const _kMuted  = Color(0xFF64748B);
const _kSep    = Color(0xFFF1F5F9);

const _pal = [
  Color(0xFF6D5FFD), Color(0xFF8B5CF6), Color(0xFF0EA5E9),
  Color(0xFF10B981), Color(0xFFF59E0B), Color(0xFFEF4444),
  Color(0xFF06B6D4), Color(0xFFF97316), Color(0xFF84CC16),
  Color(0xFFEC4899),
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
String _sf(dynamic v) =>
    (v == null || v.toString().trim().isEmpty) ? '' : v.toString().trim();
double _nd(dynamic v) =>
    v is num ? v.toDouble() : double.tryParse(_sf(v)) ?? 0;
Color _valClr(String s) {
  final l = s.toLowerCase();
  if (l.contains('valid') && !l.contains('non')) return const Color(0xFF22C55E);
  if (l.contains('non') || l.contains('refus'))  return const Color(0xFFEF4444);
  if (l.contains('attente'))                     return const Color(0xFFF59E0B);
  return const Color(0xFF94A3B8);
}
String _surf(double v) {
  if (v <= 0)    return '—';
  if (v >= 1e6)  return '${(v / 1e6).toStringAsFixed(1)}M';
  if (v >= 1000) return '${(v / 1000).toStringAsFixed(0)}k';
  return v.toStringAsFixed(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// SCORE COMMERCIAL  40% projets · 25% actions · 20% relances · 15% validation
// ─────────────────────────────────────────────────────────────────────────────
double _score({
  required int total, required int actions, required int reminders,
  required double validRate,
  required int maxProj, required int maxAct, required int maxRem,
}) {
  final p = maxProj > 0 ? (total     / maxProj) * 40 : 0.0;
  final a = maxAct  > 0 ? (actions   / maxAct)  * 25 : 0.0;
  final r = maxRem  > 0 ? (reminders / maxRem)  * 20 : 0.0;
  final v = (validRate / 100) * 15;
  return (p + a + r + v).clamp(0.0, 100.0);
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXTE GROUPE  (moyennes calculées sur la liste des users du top-10)
// ─────────────────────────────────────────────────────────────────────────────
class _G {
  final double proj, act, rem, val, surf;
  final int    maxProj;
  const _G({
    required this.proj, required this.act, required this.rem,
    required this.val, required this.surf, required this.maxProj,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// RÉSUMÉ AUTOMATIQUE
// ─────────────────────────────────────────────────────────────────────────────
String _summary({
  required int rank, required int total, required int actions,
  required double validRate, required _G g,
}) {
  if (total == 0) return 'Aucun projet enregistré pour le moment.';
  final ldr  = rank == 0;
  final hPrj = g.proj > 0 && total    >= g.proj * 1.35;
  final hAct = g.act  > 3 && actions  >= g.act  * 1.35;
  final hVal = validRate >= 65;
  final lAct = g.act  > 3 && actions  <  g.act  * 0.5;
  final lVal = total > 0 && g.val > 15 && validRate < g.val * 0.6;
  final lPrj = g.proj > 0 && total < g.proj * 0.6;

  if (ldr) {
    if (hVal) return 'Leader incontesté : $total projets — ${validRate.toStringAsFixed(0)}% validation.';
    if (hAct) return 'Leader commercial grâce à son activité CRM ($actions actions).';
    return 'Porte le plus grand portefeuille du groupe avec $total projets.';
  }
  if (hPrj && hAct && hVal) return 'Profil complet : fort volume, CRM et validation élevée.';
  if (hPrj && hAct)         return 'Excellent volume de projets et activité CRM soutenue.';
  if (hPrj && lAct)         return 'Bon volume ($total projets) — activité CRM à renforcer.';
  if (hPrj && lVal)         return 'Bon portefeuille ($total projets) — validation à améliorer.';
  if (!hPrj && hAct)        return 'Très actif commercialement ($actions actions) — développer le volume.';
  if (hVal && lPrj)         return 'Fort taux de validation (${validRate.toStringAsFixed(0)}%) — volume à développer.';
  if (lVal && lAct)         return 'Résultats sous la moyenne — CRM et validation à renforcer.';
  if (lPrj)                 return 'Volume de projets à développer pour progresser.';
  return 'Performance dans la moyenne du groupe — potentiel à exploiter.';
}

// ─────────────────────────────────────────────────────────────────────────────
// POINTS FORTS / FAIBLES  (dynamiques, basés sur moyennes du groupe)
// ─────────────────────────────────────────────────────────────────────────────
List<String> _strengths({
  required int rank, required int total, required int actions,
  required int reminders, required double validRate, required double surf,
  required _G g,
}) {
  final out = <String>[];
  if (rank == 0 && total == g.maxProj)
    out.add('Plus grand portefeuille du groupe ($total projets)');
  else if (g.proj > 0 && total >= g.proj * 1.35)
    out.add('Volume de projets supérieur à la moyenne');
  if (g.act > 3 && actions >= g.act * 1.35)
    out.add('Activité CRM au-dessus de la moyenne ($actions actions)');
  if (g.rem > 3 && reminders >= g.rem * 1.35)
    out.add('Excellent suivi des relances ($reminders)');
  if (validRate >= 65 && (g.val == 0 || validRate >= g.val * 1.1))
    out.add('Fort taux de validation (${validRate.toStringAsFixed(0)}%)');
  if (g.surf > 0 && surf >= g.surf * 1.35)
    out.add('Surface prospectée élevée (${_surf(surf)} m²)');
  return out.take(3).toList();
}

List<String> _weaknesses({
  required int total, required int actions, required int reminders,
  required double validRate, required double surf, required _G g,
}) {
  final out = <String>[];
  // Règle fondamentale : faiblesse affichée UNIQUEMENT si la moyenne du groupe
  // est significative (évite "Peu d'actions CRM" quand personne n'en a)
  if (g.act > 3 && actions < g.act * 0.5)
    out.add('Activité CRM sous la moyenne du groupe');
  if (g.rem > 3 && reminders < g.rem * 0.5)
    out.add('Suivi des relances insuffisant');
  if (total > 0 && g.val > 15 && validRate < g.val * 0.6)
    out.add('Taux de validation sous la moyenne (${validRate.toStringAsFixed(0)}%)');
  if (g.proj > 5 && total < g.proj * 0.5)
    out.add('Volume de projets sous la moyenne');
  if (g.surf > 500 && surf < g.surf * 0.3)
    out.add('Surface prospectée limitée');
  return out.take(2).toList();
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. MINI CARDS (utilisateurs / revendeurs / applicateurs)
// ─────────────────────────────────────────────────────────────────────────────
class CrmPerformanceSummary extends StatelessWidget {
  const CrmPerformanceSummary({
    super.key,
    required this.userCount,
    required this.revendeurCount,
    required this.applicateurCount,
  });
  final int userCount, revendeurCount, applicateurCount;

  @override
  Widget build(BuildContext context) {
    final items = [
      (label: 'Utilisateurs',  value: userCount,        icon: Icons.people_alt_rounded,  color: const Color(0xFF6D5FFD)),
      (label: 'Revendeurs',    value: revendeurCount,   icon: Icons.storefront_rounded,  color: const Color(0xFF0EA5E9)),
      (label: 'Applicateurs',  value: applicateurCount, icon: Icons.brush_rounded,       color: const Color(0xFF10B981)),
    ];
    return LayoutBuilder(builder: (_, box) {
      if (box.maxWidth > 480) {
        return Row(children: [
          for (int i = 0; i < items.length; i++) ...[
            Expanded(child: _MiniCard(items[i].label, items[i].value, items[i].icon, items[i].color)),
            if (i < items.length - 1) const SizedBox(width: 12),
          ],
        ]);
      }
      return Column(children: [
        for (int i = 0; i < items.length; i++) ...[
          _MiniCard(items[i].label, items[i].value, items[i].icon, items[i].color),
          if (i < items.length - 1) const SizedBox(height: 10),
        ],
      ]);
    });
  }
}

class _MiniCard extends StatelessWidget {
  const _MiniCard(this.label, this.value, this.icon, this.color);
  final String label; final int value; final IconData icon; final Color color;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
    decoration: BoxDecoration(
      color: _kCard,
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: color.withOpacity(0.18)),
      boxShadow: [BoxShadow(color: color.withOpacity(0.09), blurRadius: 10, offset: const Offset(0, 4))],
    ),
    child: Row(children: [
      Container(
        width: 38, height: 38,
        decoration: BoxDecoration(
          gradient: LinearGradient(colors: [color, color.withOpacity(0.65)],
              begin: Alignment.topLeft, end: Alignment.bottomRight),
          borderRadius: BorderRadius.circular(10),
        ),
        alignment: Alignment.center,
        child: Icon(icon, size: 17, color: Colors.white),
      ),
      const SizedBox(width: 10),
      // Expanded évite l'overflow si le label est long
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('$value',
          style: TextStyle(fontFamily: 'InterTight', fontSize: 20,
              fontWeight: FontWeight.w900, color: color, letterSpacing: -0.5)),
        Text(label, maxLines: 1, overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontFamily: 'InterTight', fontSize: 11,
              fontWeight: FontWeight.w500, color: _kMuted)),
      ])),
    ]),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. GRILLE TOP COMMERCIAUX
// ─────────────────────────────────────────────────────────────────────────────
class CrmPerformanceGrid extends StatelessWidget {
  const CrmPerformanceGrid({
    super.key,
    required this.users,
    required this.valByUser,
    this.surfaceByUser   = const {},
    this.pipelineByUser  = const {},
    this.evolutionByUser = const {},
    this.monthlyByUser   = const {},
    this.monthlyTarget   = 1,
  });

  final List                           users;
  final Map<String, int>               valByUser;
  final Map<String, double>            surfaceByUser;
  final Map<String, Map<String, int>>  pipelineByUser;
  final Map<String, double>            evolutionByUser;
  final Map<String, int>               monthlyByUser;
  final int                            monthlyTarget;

  @override
  Widget build(BuildContext context) {
    if (users.isEmpty) {
      return Center(child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.people_outline_rounded, size: 48, color: Colors.grey[300]),
          const SizedBox(height: 10),
          const Text('Aucun utilisateur',
            style: TextStyle(fontFamily: 'InterTight', fontSize: 14, color: _kMuted)),
        ]),
      ));
    }

    // Valeurs max pour normalisation du score
    int maxProj = 1, maxAct = 1, maxRem = 1;
    for (final u in users) {
      final tot = _nd(u['count']).toInt();
      final act = _nd(u['totalActions']   ?? u['actionsCount']   ?? 0).toInt();
      final rem = _nd(u['totalReminders'] ?? u['remindersCount'] ?? 0).toInt();
      if (tot > maxProj) maxProj = tot;
      if (act > maxAct)  maxAct  = act;
      if (rem > maxRem)  maxRem  = rem;
    }

    // Moyennes du groupe pour recommandations relatives
    double sProj = 0, sAct = 0, sRem = 0, sVal = 0, sSurf = 0;
    int    cVal  = 0;
    for (final u in users) {
      final uid  = _sf(u is Map ? (u['userId'] ?? u['_id'] ?? '') : '');
      final tot  = _nd(u['count']).toInt();
      final act  = _nd(u['totalActions']   ?? u['actionsCount']   ?? 0);
      final rem  = _nd(u['totalReminders'] ?? u['remindersCount'] ?? 0);
      final surf = surfaceByUser[uid] ?? _nd(u['surfaceTotal'] ?? 0);
      final val  = valByUser[uid] ?? 0;
      sProj += tot; sAct += act; sRem += rem; sSurf += surf;
      if (tot > 0) { sVal += val / tot * 100; cVal++; }
    }
    final n = users.length.toDouble().clamp(1.0, 9999.0);
    final gctx = _G(
      proj: sProj / n, act: sAct / n, rem: sRem / n,
      val:  cVal > 0 ? sVal / cVal : 0, surf: sSurf / n,
      maxProj: maxProj,
    );

    return LayoutBuilder(builder: (_, box) {
      final cols  = box.maxWidth > 900 ? 3 : box.maxWidth > 560 ? 2 : 1;
      final rows  = <Widget>[];

      for (int i = 0; i < users.length; i += cols) {
        final batch = users.sublist(i, (i + cols).clamp(0, users.length));
        final cells = <Widget>[];

        for (int j = 0; j < batch.length; j++) {
          final u   = batch[j];
          final uid = _sf(u is Map ? (u['userId'] ?? u['_id'] ?? '') : '');
          cells.add(Expanded(child: Padding(
            padding: EdgeInsets.only(left: j == 0 ? 0 : 10),
            child: _PerfCard(
              user:          u,
              rank:          i + j,
              valByUser:     valByUser,
              surface:       surfaceByUser[uid] ?? 0,
              pipeline:      pipelineByUser[uid] ?? {},
              evolution:     evolutionByUser[uid],
              curMonth:      monthlyByUser[uid] ?? 0,
              monthTarget:   monthlyTarget,
              maxProj:       maxProj,
              maxAct:        maxAct,
              maxRem:        maxRem,
              gctx:          gctx,
            ),
          )));
        }
        // Cellules vides pour compléter la dernière ligne
        for (int k = batch.length; k < cols; k++) {
          cells.add(Expanded(child: Padding(
            padding: const EdgeInsets.only(left: 10), child: const SizedBox())));
        }

        rows.add(Row(crossAxisAlignment: CrossAxisAlignment.start, children: cells));
        if (i + cols < users.length) rows.add(const SizedBox(height: 10));
      }

      return Column(children: rows);
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FICHE PERFORMANCE COMMERCIALE — layout anti-overflow
// ─────────────────────────────────────────────────────────────────────────────
class _PerfCard extends StatefulWidget {
  const _PerfCard({
    required this.user, required this.rank, required this.valByUser,
    required this.surface, required this.pipeline,
    required this.evolution, required this.curMonth, required this.monthTarget,
    required this.maxProj, required this.maxAct, required this.maxRem,
    required this.gctx,
  });
  final dynamic user; final int rank;
  final Map<String, int> valByUser;
  final double surface;
  final Map<String, int> pipeline;
  final double? evolution;
  final int curMonth, monthTarget, maxProj, maxAct, maxRem;
  final _G gctx;
  @override State<_PerfCard> createState() => _PerfCardState();
}

class _PerfCardState extends State<_PerfCard> {
  bool _hov = false;

  @override
  Widget build(BuildContext context) {
    final u         = widget.user;
    final rank      = widget.rank;
    final name      = _sf(u['userName'] ?? u['name'] ?? u['nom']);
    final email     = _sf(u['userEmail'] ?? u['email']);
    final uid       = _sf(u['userId'] ?? u['_id']);
    final total     = _nd(u['count']).toInt();
    final valid     = widget.valByUser[uid] ?? 0;
    final nonVal    = (total - valid).clamp(0, 999999);
    final vRate     = total == 0 ? 0.0 : valid / total * 100;
    final color     = _pal[rank % _pal.length];
    final actions   = _nd(u['totalActions']   ?? u['actionsCount']   ?? 0).toInt();
    final reminders = _nd(u['totalReminders'] ?? u['remindersCount'] ?? 0).toInt();
    final surf      = widget.surface > 0
        ? widget.surface
        : _nd(u['surfaceTotal'] ?? u['surfaceProspectee'] ?? 0);

    final sc      = _score(total: total, actions: actions, reminders: reminders,
        validRate: vRate, maxProj: widget.maxProj, maxAct: widget.maxAct, maxRem: widget.maxRem);
    final sum     = _summary(rank: rank, total: total, actions: actions, validRate: vRate, g: widget.gctx);
    final strong  = _strengths(rank: rank, total: total, actions: actions,
        reminders: reminders, validRate: vRate, surf: surf, g: widget.gctx);
    final weak    = _weaknesses(total: total, actions: actions,
        reminders: reminders, validRate: vRate, surf: surf, g: widget.gctx);

    final scColor = sc >= 70 ? const Color(0xFF22C55E)
        : sc >= 40 ? const Color(0xFFF59E0B) : const Color(0xFFEF4444);
    final scLabel = sc >= 80 ? 'Excellent' : sc >= 65 ? 'Bon'
        : sc >= 45 ? 'Moyen' : 'À améliorer';

    // Rang
    const titles = ['🥇 LEADER', '🥈 CHALLENGER', '🥉 TOP PERFORMER'];
    final rankTitle = rank < 3 ? titles[rank] : 'RANG #${rank + 1}';
    final rankEmoji = rank < 3 ? ['🥇', '🥈', '🥉'][rank] : '#${rank + 1}';

    // Pipeline top 4
    final stages = (widget.pipeline.entries.toList()
        ..sort((a, b) => b.value.compareTo(a.value))).take(4).toList();

    // Progression mensuelle
    final mProg = (widget.curMonth / widget.monthTarget.clamp(1, 999999)).clamp(0.0, 1.0);

    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hov = true),
      onExit:  (_) => setState(() => _hov = false),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        decoration: BoxDecoration(
          color: _kCard,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
            color: _hov ? color.withOpacity(0.5) : _kBorder,
            width: _hov ? 1.5 : 1),
          boxShadow: [BoxShadow(
            color: _hov ? color.withOpacity(0.18) : Colors.black.withOpacity(0.04),
            blurRadius: _hov ? 28 : 8, offset: const Offset(0, 4),
            spreadRadius: _hov ? 2 : 0)],
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [

          // ══ A. BANDEAU RANG + SCORE ═══════════════════════════════════════
          // Expanded à gauche absorbe tout l'espace résiduel → jamais d'overflow
          Container(
            padding: const EdgeInsets.fromLTRB(12, 9, 12, 9),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [color.withOpacity(0.13), color.withOpacity(0.04)],
                begin: Alignment.topLeft, end: Alignment.bottomRight),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(17)),
            ),
            child: Row(children: [
              // Expanded + Align → badge occupe l'espace gauche sans overflow
              Expanded(child: Align(
                alignment: Alignment.centerLeft,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: color, borderRadius: BorderRadius.circular(8)),
                  child: Text(rankTitle,
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontFamily: 'InterTight', fontSize: 9,
                        fontWeight: FontWeight.w900, color: Colors.white, letterSpacing: 0.4)),
                ),
              )),
              const SizedBox(width: 8),
              // Score — largeur naturelle fixe (~85px max)
              Row(mainAxisSize: MainAxisSize.min, children: [
                Text('${sc.toStringAsFixed(0)}',
                  style: TextStyle(fontFamily: 'InterTight', fontSize: 20,
                      fontWeight: FontWeight.w900, color: scColor, letterSpacing: -0.8)),
                Text('/100',
                  style: const TextStyle(fontFamily: 'InterTight', fontSize: 9,
                      fontWeight: FontWeight.w500, color: _kMuted)),
                const SizedBox(width: 5),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: scColor.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: scColor.withOpacity(0.25))),
                  child: Text(scLabel,
                    style: TextStyle(fontFamily: 'InterTight', fontSize: 8,
                        fontWeight: FontWeight.w800, color: scColor))),
              ]),
            ]),
          ),

          // ══ B. CORPS ═════════════════════════════════════════════════════
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [

              // — Identité — Row safe : Expanded absorbe le nom/email
              Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
                _Avatar(name.isNotEmpty ? name[0].toUpperCase() : '?',
                    color, 36, 10, _hov),
                const SizedBox(width: 8),
                Expanded(child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(name.isNotEmpty ? name : '—',
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontFamily: 'InterTight', fontSize: 13,
                        fontWeight: FontWeight.w800, color: _kText)),
                  if (email.isNotEmpty)
                    Text(email, maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontFamily: 'InterTight',
                          fontSize: 10, color: _kMuted)),
                ])),
                const SizedBox(width: 4),
                Text(rankEmoji, style: const TextStyle(fontSize: 18, height: 1)),
              ]),

              // — Résumé auto —
              const SizedBox(height: 7),
              Container(
                width: double.infinity,  // évite contrainte non bornée
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
                decoration: BoxDecoration(
                  color: color.withOpacity(0.05),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: color.withOpacity(0.12))),
                child: Text(sum,
                  maxLines: 2, overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontFamily: 'InterTight', fontSize: 10,
                      fontWeight: FontWeight.w500, color: _kText,
                      fontStyle: FontStyle.italic)),
              ),

              _line(),

              // — KPIs 6 métriques sur 2 lignes —
              const SizedBox(height: 8),
              _kpiRow([
                _K('📁', '$total',        'Projets',    const Color(0xFF4F46E5)),
                _K('📞', '$actions',      'Actions',    const Color(0xFF0EA5E9)),
                _K('🔔', '$reminders',    'Relances',   const Color(0xFFF59E0B)),
              ]),
              const SizedBox(height: 5),
              _kpiRow([
                _K('📐', _surf(surf),     'Surface m²', const Color(0xFF8B5CF6)),
                _K('✅', '$valid',        'Validés',    const Color(0xFF22C55E)),
                _K('❌', '$nonVal',       'Non-val.',   nonVal > 0
                    ? const Color(0xFFEF4444) : const Color(0xFF94A3B8)),
              ]),

              _line(),

              // — Objectif mensuel (2 lignes → plus d'overflow possible) —
              const SizedBox(height: 8),
              Row(children: [
                Expanded(child: Text('Objectif mensuel',
                  style: const TextStyle(fontFamily: 'InterTight', fontSize: 10,
                      fontWeight: FontWeight.w700, color: _kMuted))),
                // Évolution 30j — à droite du libellé, Expanded absorbe à gauche
                if (widget.evolution != null) _EvoChip(widget.evolution!),
              ]),
              const SizedBox(height: 5),
              Row(children: [
                // Barre Expanded → prend tout l'espace résiduel
                Expanded(child: TweenAnimationBuilder<double>(
                  tween: Tween(begin: 0.0, end: mProg),
                  duration: const Duration(milliseconds: 800), curve: Curves.easeOut,
                  builder: (_, v, __) => ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: v, minHeight: 8,
                      backgroundColor: color.withOpacity(0.1),
                      valueColor: AlwaysStoppedAnimation(
                          mProg >= 1.0 ? const Color(0xFF22C55E) : color)),
                  ),
                )),
                const SizedBox(width: 7),
                // Compteur court (ex: "8/15") — largeur fixe naturelle
                Text('${widget.curMonth}/${widget.monthTarget}',
                  style: TextStyle(fontFamily: 'InterTight', fontSize: 10,
                      fontWeight: FontWeight.w800, color: color)),
              ]),

              // — Points forts / faibles —
              if (strong.isNotEmpty || weak.isNotEmpty) ...[
                _line(),
                const SizedBox(height: 8),
                if (strong.isNotEmpty) ...[
                  const Text('🟢 Points forts',
                    style: TextStyle(fontFamily: 'InterTight', fontSize: 10,
                        fontWeight: FontWeight.w700, color: Color(0xFF059669))),
                  const SizedBox(height: 3),
                  for (final s in strong) _Bullet(s, true),
                ],
                if (weak.isNotEmpty) ...[
                  if (strong.isNotEmpty) const SizedBox(height: 5),
                  const Text('🔴 Points faibles',
                    style: TextStyle(fontFamily: 'InterTight', fontSize: 10,
                        fontWeight: FontWeight.w700, color: Color(0xFFDC2626))),
                  const SizedBox(height: 3),
                  for (final w in weak) _Bullet(w, false),
                ],
              ],

              // — Pipeline —
              if (stages.isNotEmpty) ...[
                _line(),
                const SizedBox(height: 8),
                Wrap(spacing: 5, runSpacing: 5,
                  children: stages.map((e) => _Stage(e.key, e.value)).toList()),
              ],
            ]),
          ),
        ]),
      ),
    );
  }

  Widget _line() => const Padding(
    padding: EdgeInsets.only(top: 8),
    child: Divider(height: 1, thickness: 0.8, color: _kSep));

  // Ligne KPI : Row avec 3 Expanded → overflow impossible
  Widget _kpiRow(List<_K> items) => Row(
    children: items.asMap().entries.map((e) => Expanded(
      child: Padding(
        padding: EdgeInsets.only(left: e.key == 0 ? 0 : 5),
        child: _KpiCell(e.value),
      ),
    )).toList(),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MICRO-WIDGETS
// ─────────────────────────────────────────────────────────────────────────────

// Données KPI cell
class _K {
  const _K(this.e, this.v, this.l, this.c);
  final String e, v, l; final Color c;
}

// Cellule KPI — Expanded sur le texte valeur évite l'overflow
class _KpiCell extends StatelessWidget {
  const _KpiCell(this.item);
  final _K item;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
    decoration: BoxDecoration(
      color: item.c.withOpacity(0.06),
      borderRadius: BorderRadius.circular(8),
      border: Border.all(color: item.c.withOpacity(0.12))),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        // Row safe : Flexible sur le texte valeur (ne jamais mettre mainAxisSize.min)
        Row(children: [
          Text(item.e, style: const TextStyle(fontSize: 10)),
          const SizedBox(width: 3),
          Flexible(child: Text(item.v,
            maxLines: 1, overflow: TextOverflow.ellipsis,
            style: TextStyle(fontFamily: 'InterTight', fontSize: 11,
                fontWeight: FontWeight.w800, color: item.c))),
        ]),
        Text(item.l, maxLines: 1, overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontFamily: 'InterTight', fontSize: 8,
              fontWeight: FontWeight.w500, color: _kMuted)),
      ],
    ),
  );
}

// Chip évolution 30 jours
class _EvoChip extends StatelessWidget {
  const _EvoChip(this.pct);
  final double pct;
  @override
  Widget build(BuildContext context) {
    final up    = pct >= 0;
    final color = up ? const Color(0xFF22C55E) : const Color(0xFFEF4444);
    final lbl   = up
        ? (pct >= 1000 ? 'Nouveau' : '+${pct.toStringAsFixed(0)}%')
        : '${pct.toStringAsFixed(0)}%';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withOpacity(0.10),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: color.withOpacity(0.22))),
      child: Text('${up ? '↑' : '↓'} $lbl',
        style: TextStyle(fontFamily: 'InterTight', fontSize: 9,
            fontWeight: FontWeight.w800, color: color)),
    );
  }
}

// Bullet point — Expanded sur le texte = jamais d'overflow
class _Bullet extends StatelessWidget {
  const _Bullet(this.text, this.positive);
  final String text; final bool positive;
  @override
  Widget build(BuildContext context) {
    final c = positive ? const Color(0xFF059669) : const Color(0xFFDC2626);
    return Padding(
      padding: const EdgeInsets.only(bottom: 3),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(padding: const EdgeInsets.only(top: 5, right: 6),
          child: Container(width: 4, height: 4,
            decoration: BoxDecoration(color: c, shape: BoxShape.circle))),
        Expanded(child: Text(text,
          maxLines: 1, overflow: TextOverflow.ellipsis,
          style: TextStyle(fontFamily: 'InterTight', fontSize: 10,
              fontWeight: FontWeight.w600, color: c))),
      ]),
    );
  }
}

// Badge pipeline
class _Stage extends StatelessWidget {
  const _Stage(this.stage, this.count);
  final String stage; final int count;
  Color get _c {
    final l = stage.toLowerCase();
    if (l.contains('identif'))  return const Color(0xFF6B7280);
    if (l.contains('prospect')) return const Color(0xFF3B82F6);
    if (l.contains('visite'))   return const Color(0xFF6366F1);
    if (l.contains('plan'))     return const Color(0xFF8B5CF6);
    if (l.contains('devis'))    return const Color(0xFFF59E0B);
    if (l.contains('nego'))     return const Color(0xFFF97316);
    if (l.contains('gagn') || (l.contains('valid') && !l.contains('non')))
      return const Color(0xFF22C55E);
    if (l.contains('perd') || l.contains('refus')) return const Color(0xFFEF4444);
    return const Color(0xFF94A3B8);
  }
  @override
  Widget build(BuildContext context) {
    final lbl = stage.length > 11 ? '${stage.substring(0, 11)}…' : stage;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
      decoration: BoxDecoration(
        color: _c.withOpacity(0.08),
        borderRadius: BorderRadius.circular(7),
        border: Border.all(color: _c.withOpacity(0.18))),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Text(lbl, style: TextStyle(fontFamily: 'InterTight', fontSize: 9,
            fontWeight: FontWeight.w600, color: _c)),
        const SizedBox(width: 4),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
          decoration: BoxDecoration(
            color: _c.withOpacity(0.18), borderRadius: BorderRadius.circular(4)),
          child: Text('$count', style: TextStyle(fontFamily: 'InterTight',
              fontSize: 9, fontWeight: FontWeight.w900, color: _c))),
      ]),
    );
  }
}

// Avatar gradient
class _Avatar extends StatelessWidget {
  const _Avatar(this.initial, this.color, this.size, this.radius, this.shadow);
  final String initial; final Color color;
  final double size, radius; final bool shadow;
  @override
  Widget build(BuildContext context) => Container(
    width: size, height: size,
    decoration: BoxDecoration(
      gradient: LinearGradient(colors: [color, color.withOpacity(0.65)],
          begin: Alignment.topLeft, end: Alignment.bottomRight),
      borderRadius: BorderRadius.circular(radius),
      boxShadow: shadow ? [BoxShadow(color: color.withOpacity(0.4),
          blurRadius: 10, offset: const Offset(0, 3))] : []),
    alignment: Alignment.center,
    child: Text(initial, style: TextStyle(fontFamily: 'InterTight',
        fontSize: size * 0.4, fontWeight: FontWeight.w900, color: Colors.white)),
  );
}

