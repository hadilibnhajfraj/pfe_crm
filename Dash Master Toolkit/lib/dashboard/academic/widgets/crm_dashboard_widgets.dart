// lib/dashboard/academic/widgets/crm_dashboard_widgets.dart
//
// Design system inspiré HubSpot / Pipedrive / Salesforce Lightning.
// Contient :
//   • CrmModernKpiCard   — gradient + hover + badge évolution
//   • CrmDonutWithLegend — donut avec total centré + légende verticale
//   • CrmStatusBars      — barres animées avec pourcentage
//   • CrmTopCommerciaux  — classement top 5 avec taux réussite
//   • CrmPipelineHealth  — score santé + métriques
//
// Logique métier intacte — uniquement UI/UX.

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

// ─────────────────────────────────────────────────────────────────────────────
// DESIGN TOKENS
// ─────────────────────────────────────────────────────────────────────────────
const _kText   = Color(0xFF0F172A);
const _kMuted  = Color(0xFF64748B);
const _kBorder = Color(0xFFE2E8F0);
const _kBg     = Color(0xFFF8FAFC);

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS (privés au fichier)
// ─────────────────────────────────────────────────────────────────────────────

double _n(dynamic v) =>
    v is num ? v.toDouble() : double.tryParse((v ?? '').toString()) ?? 0;

String _s(dynamic v) =>
    (v == null || v.toString().trim().isEmpty) ? '' : v.toString().trim();

Color _stageClr(String raw) {
  final l = raw.toLowerCase();
  if (l.contains('identif'))  return const Color(0xFF6B7280);
  if (l.contains('prospect')) return const Color(0xFF3B82F6);
  if (l.contains('contact'))  return const Color(0xFF0EA5E9);
  if (l.contains('visite'))   return const Color(0xFF6366F1);
  if (l.contains('plan'))     return const Color(0xFF8B5CF6);
  if (l.contains('echant'))   return const Color(0xFF14B8A6);
  if (l.contains('devis'))    return const Color(0xFFF59E0B);
  if (l.contains('nego'))     return const Color(0xFFF97316);
  if (l.contains('gagn') || (l.contains('valid') && !l.contains('non')))
    return const Color(0xFF22C55E);
  if (l.contains('perd') || l.contains('refus') || l.contains('non val'))
    return const Color(0xFFEF4444);
  if (l.contains('commande')) return const Color(0xFF8B5CF6);
  if (l.contains('attente'))  return const Color(0xFFF59E0B);
  return const Color(0xFF94A3B8);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. CrmModernKpiCard — gradient, hover scale, badge évolution
// ─────────────────────────────────────────────────────────────────────────────

class CrmModernKpiCard extends StatefulWidget {
  const CrmModernKpiCard({
    super.key,
    required this.label,
    required this.value,
    required this.icon,
    required this.gradient,
    this.trend,
    this.isUp = true,
    this.subtitle,
    this.onTap,
  });

  final String      label;
  final String      value;
  final IconData    icon;
  final List<Color> gradient;
  final String?     trend;
  final bool        isUp;
  final String?     subtitle;
  // Rend la carte cliquable (curseur pointer + hover + scale 98%→100% au
  // clic) sans changer son apparence par défaut quand absent.
  final VoidCallback? onTap;

  @override
  State<CrmModernKpiCard> createState() => _CrmModernKpiCardState();
}

class _CrmModernKpiCardState extends State<CrmModernKpiCard> {
  bool _hovered = false;
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final trendVisible = widget.trend != null && widget.trend != '—';
    final clickable     = widget.onTap != null;
    // Pressed (98%) prend le pas sur hover (102.8%) — animation scale
    // 98% → 100% demandée au clic, hover sinon.
    final scale = _pressed ? 0.98 : (_hovered ? 1.028 : 1.0);

    return MouseRegion(
      cursor: clickable ? SystemMouseCursors.click : SystemMouseCursors.basic,
      onEnter: (_) => setState(() => _hovered = true),
      onExit:  (_) => setState(() { _hovered = false; _pressed = false; }),
      child: GestureDetector(
        onTap: widget.onTap,
        onTapDown: clickable ? (_) => setState(() => _pressed = true) : null,
        onTapUp:   clickable ? (_) => setState(() => _pressed = false) : null,
        onTapCancel: clickable ? () => setState(() => _pressed = false) : null,
        child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
        transform: Matrix4.identity()
          ..scale(scale),
        transformAlignment: Alignment.center,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: widget.gradient,
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(22),
          boxShadow: [
            BoxShadow(
              color: widget.gradient.first
                  .withOpacity(_hovered ? 0.50 : 0.28),
              blurRadius: _hovered ? 32 : 16,
              offset: const Offset(0, 8),
              spreadRadius: _hovered ? 2 : 0,
            ),
          ],
        ),
        child: Stack(children: [
          // Cercles décoratifs (glassmorphism léger)
          Positioned(right: -18, top: -18,
            child: Container(width: 100, height: 100,
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.07),
                shape: BoxShape.circle,
              ))),
          Positioned(right: 18, bottom: -28,
            child: Container(width: 66, height: 66,
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.05),
                shape: BoxShape.circle,
              ))),
          // Contenu
          Padding(
            padding: const EdgeInsets.all(20),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  // Icône avec fond blanc translucide
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.22),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(widget.icon, size: 22, color: Colors.white),
                  ),
                  const Spacer(),
                  // Badge tendance
                  if (trendVisible)
                    AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 9, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(
                            _hovered ? 0.32 : 0.22),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        Icon(
                          widget.isUp
                              ? Icons.trending_up_rounded
                              : Icons.trending_down_rounded,
                          size: 13, color: Colors.white,
                        ),
                        const SizedBox(width: 3),
                        Text(widget.trend!,
                          style: const TextStyle(
                            fontFamily: 'InterTight', fontSize: 11,
                            fontWeight: FontWeight.w700, color: Colors.white,
                          )),
                      ]),
                    ),
                ]),
                const SizedBox(height: 18),
                // Valeur principale
                Text(widget.value,
                  style: const TextStyle(
                    fontFamily: 'InterTight', fontSize: 38,
                    fontWeight: FontWeight.w900, color: Colors.white,
                    letterSpacing: -1.5, height: 1,
                  )),
                const SizedBox(height: 6),
                Text(AppLocalizations.of(context).translate(widget.label),
                  style: const TextStyle(
                    fontFamily: 'InterTight', fontSize: 13,
                    fontWeight: FontWeight.w500, color: Colors.white70,
                  )),
                if (widget.subtitle != null) ...[
                  const SizedBox(height: 3),
                  Text(widget.subtitle!,
                    style: TextStyle(
                      fontFamily: 'InterTight', fontSize: 11,
                      color: Colors.white.withOpacity(0.55),
                    )),
                ],
              ]),
          ),
        ]),
      ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. CrmDonutWithLegend — total centré, légende verticale à droite
// ─────────────────────────────────────────────────────────────────────────────

class CrmDonutWithLegend extends StatefulWidget {
  const CrmDonutWithLegend({
    super.key,
    required this.stats,
    required this.colorOf,
    this.centerLabel = 'projets',
    this.onSegmentTap,
  });

  final List<Map<String, dynamic>>  stats;
  final Color Function(String s)    colorOf;
  final String                      centerLabel;
  // Clic sur une part du donut ou sa ligne de légende → ouvre la liste des
  // projets filtrée sur ce statut. Absent = comportement inchangé (hover only).
  final void Function(String statut)? onSegmentTap;

  @override
  State<CrmDonutWithLegend> createState() => _CrmDonutWithLegendState();
}

class _CrmDonutWithLegendState extends State<CrmDonutWithLegend> {
  int _touched = -1;

  @override
  Widget build(BuildContext context) {
    final total = widget.stats.fold<double>(0, (s, e) => s + _n(e['count']));
    if (total == 0) return _empty('Aucune donnée');

    final donut = SizedBox(
      width: 200, height: 200,
      child: Stack(alignment: Alignment.center, children: [
        PieChart(
          PieChartData(
            centerSpaceRadius: 65,
            sectionsSpace: 3,
            pieTouchData: PieTouchData(
              touchCallback: (event, response) {
                if (!event.isInterestedForInteractions ||
                    response?.touchedSection == null) {
                  setState(() => _touched = -1);
                  return;
                }
                final idx = response!.touchedSection!.touchedSectionIndex;
                setState(() => _touched = idx);
                // Un vrai tap (pas juste un survol) déclenche la navigation.
                if (event is FlTapUpEvent &&
                    widget.onSegmentTap != null &&
                    idx >= 0 &&
                    idx < widget.stats.length) {
                  widget.onSegmentTap!(_s(widget.stats[idx]['statut']));
                }
              },
            ),
            sections: widget.stats.asMap().entries.map((en) {
              final i     = en.key;
              final s     = en.value;
              final cnt   = _n(s['count']);
              final pct   = cnt / total * 100;
              final color = widget.colorOf(_s(s['statut']));
              final hit   = i == _touched;
              return PieChartSectionData(
                value: cnt,
                color: color,
                radius: hit ? 65 : 56,
                title: hit ? '${pct.toStringAsFixed(0)}%' : '',
                titleStyle: const TextStyle(
                  fontFamily: 'InterTight', fontSize: 13,
                  fontWeight: FontWeight.w900, color: Colors.white,
                ),
              );
            }).toList(),
          ),
          swapAnimationDuration: const Duration(milliseconds: 280),
        ),
        // Total au centre
        Column(mainAxisSize: MainAxisSize.min, children: [
          Text('${total.toInt()}',
            style: const TextStyle(
              fontFamily: 'InterTight', fontSize: 28,
              fontWeight: FontWeight.w900, color: _kText,
              letterSpacing: -1,
            )),
          Text(widget.centerLabel,
            style: const TextStyle(
              fontFamily: 'InterTight', fontSize: 11,
              fontWeight: FontWeight.w500, color: _kMuted,
            )),
        ]),
      ]),
    );

    final legend = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisAlignment: MainAxisAlignment.center,
      children: widget.stats.asMap().entries.map((en) {
        final i     = en.key;
        final s     = en.value;
        final cnt   = _n(s['count']);
        final pct   = total == 0 ? 0.0 : cnt / total * 100;
        final color = widget.colorOf(_s(s['statut']));
        final hit   = i == _touched;
        final clickable = widget.onSegmentTap != null;

        final row = AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          margin: const EdgeInsets.symmetric(vertical: 3),
          padding: EdgeInsets.symmetric(
              horizontal: hit ? 10 : 8, vertical: 7),
          decoration: BoxDecoration(
            color: hit ? color.withOpacity(0.08) : Colors.transparent,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: hit ? color.withOpacity(0.3) : Colors.transparent),
          ),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Container(
              width: 10, height: 10,
              decoration: BoxDecoration(
                color: color,
                borderRadius: BorderRadius.circular(3),
                boxShadow: [BoxShadow(
                  color: color.withOpacity(0.45), blurRadius: 4)],
              ),
            ),
            const SizedBox(width: 8),
            Flexible(child: Text(_s(s['statut']),
              style: TextStyle(
                fontFamily: 'InterTight', fontSize: 12,
                fontWeight: hit ? FontWeight.w700 : FontWeight.w500,
                color: hit ? color : _kMuted,
              ),
              maxLines: 1, overflow: TextOverflow.ellipsis,
            )),
            const SizedBox(width: 8),
            Text('${cnt.toInt()}',
              style: TextStyle(
                fontFamily: 'InterTight', fontSize: 13,
                fontWeight: FontWeight.w800,
                color: hit ? color : _kText,
              )),
            const SizedBox(width: 4),
            Text('(${pct.toStringAsFixed(0)}%)',
              style: const TextStyle(
                fontFamily: 'InterTight', fontSize: 10, color: _kMuted)),
          ]),
        );

        if (!clickable) return row;
        return MouseRegion(
          cursor: SystemMouseCursors.click,
          child: GestureDetector(
            onTap: () => widget.onSegmentTap!(_s(s['statut'])),
            child: row,
          ),
        );
      }).toList(),
    );

    return LayoutBuilder(builder: (_, box) {
      if (box.maxWidth > 480) {
        return Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
          donut,
          const SizedBox(width: 22),
          Expanded(child: legend),
        ]);
      }
      return Column(children: [donut, const SizedBox(height: 20), legend]);
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. CrmStatusBars — barres animées (stagger), pourcentage, couleurs dynamiques
// ─────────────────────────────────────────────────────────────────────────────

class CrmStatusBars extends StatefulWidget {
  const CrmStatusBars({
    super.key,
    required this.stats,
    required this.colorOf,
    this.onBarTap,
  });

  final List<Map<String, dynamic>> stats;
  final Color Function(String s)   colorOf;
  // Clic sur une barre → ouvre la liste des projets filtrée sur ce statut.
  final void Function(String statut)? onBarTap;

  @override
  State<CrmStatusBars> createState() => _CrmStatusBarsState();
}

class _CrmStatusBarsState extends State<CrmStatusBars>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1100),
    )..forward();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final total  = widget.stats.fold<double>(0, (s, e) => s + _n(e['count']));
    final maxCnt = widget.stats.fold<double>(0, (m, e) => _n(e['count']) > m ? _n(e['count']) : m);

    if (total == 0 || maxCnt == 0) return _empty('Aucune donnée');

    final len = widget.stats.length;

    return AnimatedBuilder(
      animation: _ctrl,
      builder: (_, __) => Column(
        children: widget.stats.asMap().entries.map((en) {
          final i     = en.key;
          final s     = en.value;
          final count = _n(s['count']);
          final pct   = count / total * 100;
          final frac  = count / maxCnt;
          final color = widget.colorOf(_s(s['statut']));

          // Stagger : chaque barre démarre après la précédente
          final start  = len <= 1 ? 0.0 : (i / len * 0.45);
          final anim   = CurvedAnimation(
            parent: _ctrl,
            curve: Interval(start, 1.0, curve: Curves.easeOutCubic),
          ).value;

          final bar = Padding(
            padding: const EdgeInsets.only(bottom: 14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              // Ligne étiquette
              Row(children: [
                Expanded(
                  child: Text(_s(s['statut']),
                    style: const TextStyle(
                      fontFamily: 'InterTight', fontSize: 12,
                      fontWeight: FontWeight.w600, color: _kText),
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                  ),
                ),
                Text('${count.toInt()}',
                  style: TextStyle(
                    fontFamily: 'InterTight', fontSize: 13,
                    fontWeight: FontWeight.w800, color: color)),
                const SizedBox(width: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                  decoration: BoxDecoration(
                    color: color.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text('${pct.toStringAsFixed(0)}%',
                    style: TextStyle(
                      fontFamily: 'InterTight', fontSize: 10,
                      fontWeight: FontWeight.w700, color: color)),
                ),
              ]),
              const SizedBox(height: 7),
              // Barre animée
              ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: SizedBox(
                  height: 22,
                  child: Stack(children: [
                    // Fond
                    Container(color: color.withOpacity(0.08)),
                    // Remplissage animé avec gradient
                    FractionallySizedBox(
                      widthFactor: (frac * anim).clamp(0.0, 1.0),
                      child: Container(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            colors: [color, color.withOpacity(0.75)],
                            begin: Alignment.centerLeft,
                            end: Alignment.centerRight,
                          ),
                        ),
                      ),
                    ),
                    // Shimmer sur le remplissage
                    if (anim > 0.02)
                      Positioned(
                        left: 0, right: 0, top: 0, bottom: 0,
                        child: Align(
                          alignment: Alignment.centerLeft,
                          child: FractionallySizedBox(
                            widthFactor: (frac * anim).clamp(0.0, 1.0),
                            child: Align(
                              alignment: Alignment.centerRight,
                              child: Container(
                                width: 4,
                                decoration: BoxDecoration(
                                  gradient: LinearGradient(
                                    colors: [
                                      Colors.white.withOpacity(0.0),
                                      Colors.white.withOpacity(0.35),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                  ]),
                ),
              ),
            ]),
          );

          if (widget.onBarTap == null) return bar;
          return MouseRegion(
            cursor: SystemMouseCursors.click,
            child: GestureDetector(
              onTap: () => widget.onBarTap!(_s(s['statut'])),
              child: bar,
            ),
          );
        }).toList(),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. CrmTopCommerciaux — top 5 avec médailles, taux réussite, barre relative
// ─────────────────────────────────────────────────────────────────────────────

class CrmTopCommerciaux extends StatelessWidget {
  const CrmTopCommerciaux({
    super.key,
    required this.userStats,
    required this.valByUser,
  });

  final List            userStats;
  final Map<String,int> valByUser;

  @override
  Widget build(BuildContext context) {
    if (userStats.isEmpty) return _empty('Aucun commercial disponible');

    final sorted = List.from(userStats)
      ..sort((a, b) => (_n(b['count']) - _n(a['count'])).toInt());
    final top5    = sorted.take(5).toList();
    final maxCnt  = top5.isEmpty ? 1.0 : _n(top5.first['count']).clamp(1, 1e9);

    const medals = ['🥇', '🥈', '🥉'];
    const palette = [
      Color(0xFF4F46E5), Color(0xFF0EA5E9), Color(0xFF10B981),
      Color(0xFFF59E0B), Color(0xFFEF4444),
    ];

    return Column(
      children: top5.asMap().entries.map((en) {
        final i     = en.key;
        final u     = en.value;
        final name  = _s(u['userName'] ?? u['name'] ?? u['nom'] ?? '');
        final uid   = _s(u['userId'] ?? u['_id'] ?? '');
        final total = _n(u['count']).toInt();
        final valid = valByUser[uid] ?? 0;
        final rate  = total == 0 ? 0.0 : valid / total * 100;
        final frac  = (total / maxCnt).clamp(0.0, 1.0);
        final color = palette[i % palette.length];
        final medal = i < 3 ? medals[i] : '${i + 1}';

        return Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: i == 0
                ? color.withOpacity(0.05)
                : _kBg,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: i == 0 ? color.withOpacity(0.22) : _kBorder,
              width: i == 0 ? 1.5 : 1,
            ),
          ),
          child: Row(children: [
            // Rang / médaille
            SizedBox(
              width: 32,
              child: Text(medal,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: i < 3 ? 20 : 13,
                  fontWeight: FontWeight.w800,
                  color: i < 3 ? null : _kMuted,
                )),
            ),
            const SizedBox(width: 10),
            // Avatar gradient
            Container(
              width: 38, height: 38,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [color, color.withOpacity(0.65)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(10),
              ),
              alignment: Alignment.center,
              child: Text(
                name.isNotEmpty ? name[0].toUpperCase() : '?',
                style: const TextStyle(
                  fontFamily: 'InterTight', fontSize: 15,
                  fontWeight: FontWeight.w800, color: Colors.white,
                )),
            ),
            const SizedBox(width: 12),
            // Nom + barre relative
            Expanded(child: Column(
              crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Flexible(child: Text(name.isNotEmpty ? name : '—',
                  style: const TextStyle(
                    fontFamily: 'InterTight', fontSize: 13,
                    fontWeight: FontWeight.w700, color: _kText),
                  maxLines: 1, overflow: TextOverflow.ellipsis)),
                const SizedBox(width: 8),
                if (rate > 0)
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: (rate >= 70
                          ? const Color(0xFF22C55E)
                          : rate >= 40
                              ? const Color(0xFFF59E0B)
                              : const Color(0xFFEF4444))
                          .withOpacity(0.1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text('${rate.toStringAsFixed(0)}%',
                      style: TextStyle(
                        fontFamily: 'InterTight', fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: rate >= 70
                            ? const Color(0xFF22C55E)
                            : rate >= 40
                                ? const Color(0xFFF59E0B)
                                : const Color(0xFFEF4444),
                      )),
                  ),
              ]),
              const SizedBox(height: 7),
              ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: SizedBox(
                  height: 6,
                  child: LinearProgressIndicator(
                    value: frac,
                    backgroundColor: color.withOpacity(0.1),
                    valueColor: AlwaysStoppedAnimation(color),
                  ),
                ),
              ),
            ])),
            const SizedBox(width: 12),
            // Compteur
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text('$total',
                style: TextStyle(
                  fontFamily: 'InterTight', fontSize: 18,
                  fontWeight: FontWeight.w900, color: color,
                  letterSpacing: -0.5,
                )),
              const Text('projets',
                style: TextStyle(
                  fontFamily: 'InterTight', fontSize: 10, color: _kMuted)),
            ]),
          ]),
        );
      }).toList(),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. CrmPipelineHealth — score santé, métriques, étapes actives
// ─────────────────────────────────────────────────────────────────────────────

class CrmPipelineHealth extends StatelessWidget {
  const CrmPipelineHealth({
    super.key,
    required this.statutStats,
    required this.total,
    required this.validated,
  });

  final List<Map<String, dynamic>> statutStats;
  final int total;
  final int validated;

  double get _valRate  => total == 0 ? 0 : validated / total * 100;
  double get _failRate => total == 0 ? 0 : (total - validated) / total * 100;
  double get _diversity =>
      (statutStats.length / 9 * 100).clamp(0.0, 100.0);

  double get _score =>
      (_valRate * 0.55 + _diversity * 0.3 + (total > 0 ? 15.0 : 0)).clamp(0, 100);

  Color get _scoreColor {
    if (_score >= 70) return const Color(0xFF22C55E);
    if (_score >= 40) return const Color(0xFFF59E0B);
    return const Color(0xFFEF4444);
  }

  String get _scoreLabel {
    if (_score >= 70) return '✓ Excellent';
    if (_score >= 40) return '⚠ Moyen';
    return '✗ Faible';
  }

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      // ── Score ──────────────────────────────────────────────────────────────
      Row(children: [
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start,
          children: [
          const Text('Pipeline Health Score',
            style: TextStyle(fontFamily: 'InterTight', fontSize: 12,
                fontWeight: FontWeight.w600, color: _kMuted)),
          const SizedBox(height: 6),
          Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text(_score.toStringAsFixed(0),
              style: TextStyle(
                fontFamily: 'InterTight', fontSize: 36,
                fontWeight: FontWeight.w900, color: _scoreColor,
                letterSpacing: -1.5,
              )),
            const Padding(
              padding: EdgeInsets.only(bottom: 6),
              child: Text('/100',
                style: TextStyle(fontFamily: 'InterTight', fontSize: 15,
                    fontWeight: FontWeight.w500, color: _kMuted))),
            const SizedBox(width: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: _scoreColor.withOpacity(0.1),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: _scoreColor.withOpacity(0.3)),
              ),
              child: Text(_scoreLabel,
                style: TextStyle(fontFamily: 'InterTight', fontSize: 11,
                    fontWeight: FontWeight.w700, color: _scoreColor)),
            ),
          ]),
        ])),
        // Jauge circulaire
        SizedBox(width: 72, height: 72,
          child: Stack(alignment: Alignment.center, children: [
            CircularProgressIndicator(
              value: _score / 100,
              backgroundColor: _scoreColor.withOpacity(0.1),
              valueColor: AlwaysStoppedAnimation(_scoreColor),
              strokeWidth: 8,
              strokeCap: StrokeCap.round,
            ),
            Text('${_score.toStringAsFixed(0)}%',
              style: TextStyle(fontFamily: 'InterTight', fontSize: 11,
                  fontWeight: FontWeight.w800, color: _scoreColor)),
          ])),
      ]),

      const SizedBox(height: 20),
      const Divider(height: 1, color: _kBorder),
      const SizedBox(height: 16),

      // ── Métriques ─────────────────────────────────────────────────────────
      _Metric('Taux de validation', _valRate,  const Color(0xFF22C55E)),
      _Metric('Taux d\'échec',      _failRate, const Color(0xFFEF4444)),
      _Metric('Richesse pipeline',  _diversity, const Color(0xFF4F46E5)),

      const SizedBox(height: 16),
      const Divider(height: 1, color: _kBorder),
      const SizedBox(height: 14),

      // ── Étapes actives ─────────────────────────────────────────────────────
      const Text('Étapes actives',
        style: TextStyle(fontFamily: 'InterTight', fontSize: 12,
            fontWeight: FontWeight.w600, color: _kMuted)),
      const SizedBox(height: 10),
      Wrap(spacing: 8, runSpacing: 8,
        children: statutStats.take(7).map((s) {
          final color = _stageClr(_s(s['statut']));
          return Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: color.withOpacity(0.08),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: color.withOpacity(0.25)),
            ),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Container(width: 6, height: 6,
                decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
              const SizedBox(width: 6),
              Text(_s(s['statut']),
                style: TextStyle(fontFamily: 'InterTight', fontSize: 11,
                    fontWeight: FontWeight.w600, color: color),
                maxLines: 1, overflow: TextOverflow.ellipsis),
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                decoration: BoxDecoration(
                  color: color.withOpacity(0.18),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text('${_n(s['count']).toInt()}',
                  style: TextStyle(fontFamily: 'InterTight', fontSize: 10,
                      fontWeight: FontWeight.w800, color: color)),
              ),
            ]),
          );
        }).toList(),
      ),
    ]);
  }
}

// Ligne métrique réutilisable
class _Metric extends StatelessWidget {
  const _Metric(this.label, this.pct, this.color);
  final String label;
  final double pct;
  final Color  color;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Expanded(child: Text(AppLocalizations.of(context).translate(label),
          style: const TextStyle(fontFamily: 'InterTight', fontSize: 12,
              fontWeight: FontWeight.w500, color: _kText))),
        Text('${pct.toStringAsFixed(0)}%',
          style: TextStyle(fontFamily: 'InterTight', fontSize: 12,
              fontWeight: FontWeight.w700, color: color)),
      ]),
      const SizedBox(height: 5),
      ClipRRect(
        borderRadius: BorderRadius.circular(7),
        child: LinearProgressIndicator(
          value: (pct / 100).clamp(0, 1),
          minHeight: 8,
          backgroundColor: color.withOpacity(0.08),
          valueColor: AlwaysStoppedAnimation(color),
        ),
      ),
    ]),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EMPTY STATE partagé
// ─────────────────────────────────────────────────────────────────────────────

Widget _empty(String msg) => Center(
  child: Padding(padding: const EdgeInsets.all(24),
    child: Column(mainAxisSize: MainAxisSize.min, children: [
      Icon(Icons.inbox_rounded, size: 42, color: Colors.grey[300]),
      const SizedBox(height: 10),
      Text(msg, style: const TextStyle(
        fontFamily: 'InterTight', fontSize: 13, color: _kMuted,
        fontWeight: FontWeight.w500)),
    ])),
);

// ─────────────────────────────────────────────────────────────────────────────
// 6. CrmFamilyDiameterChart — bar chart interactif, toggle Famille/Diamètre
//    (Répartition par famille / Répartition par diamètre — dashboard user)
// ─────────────────────────────────────────────────────────────────────────────

enum CrmFamilyDiameterMode { family, diameter }

class CrmFamilyDiameterChart extends StatefulWidget {
  const CrmFamilyDiameterChart({
    super.key,
    required this.familyStats,
    required this.diameterStats,
    this.onFamilyTap,
    this.onDiameterTap,
  });

  // [{family: 'PROBAR', count: 42}, {family: 'PROMESH', count: 18}]
  final List<Map<String, dynamic>> familyStats;
  // [{diameter: 4, count: 12}, ...] — déjà trié numériquement par l'appelant.
  final List<Map<String, dynamic>> diameterStats;
  final void Function(String family)?  onFamilyTap;
  final void Function(int diameter)?   onDiameterTap;

  @override
  State<CrmFamilyDiameterChart> createState() => _CrmFamilyDiameterChartState();
}

class _CrmFamilyDiameterChartState extends State<CrmFamilyDiameterChart> {
  CrmFamilyDiameterMode _mode = CrmFamilyDiameterMode.family;

  static const Map<String, Color> _familyColors = {
    'PROBAR': Color(0xFF4F46E5),
    'PROMESH': Color(0xFF14B8A6),
  };
  static const Color _diameterColor = Color(0xFF0284C7);

  @override
  Widget build(BuildContext context) {
    final isFamily = _mode == CrmFamilyDiameterMode.family;
    final stats    = isFamily ? widget.familyStats : widget.diameterStats;
    final clickable = isFamily ? widget.onFamilyTap != null : widget.onDiameterTap != null;

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        _modeChip('Par famille', CrmFamilyDiameterMode.family),
        const SizedBox(width: 8),
        _modeChip('Par diamètre', CrmFamilyDiameterMode.diameter),
      ]),
      const SizedBox(height: 20),
      SizedBox(
        height: 220,
        child: stats.isEmpty
            ? _empty('Aucune donnée')
            : MouseRegion(
                cursor: clickable ? SystemMouseCursors.click : SystemMouseCursors.basic,
                child: _buildChart(stats, isFamily),
              ),
      ),
    ]);
  }

  Widget _modeChip(String label, CrmFamilyDiameterMode mode) {
    final selected = _mode == mode;
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
        onTap: () => setState(() => _mode = mode),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: selected ? const Color(0xFF4F46E5) : const Color(0xFFF1F5F9),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(AppLocalizations.of(context).translate(label), style: TextStyle(
            fontFamily: 'InterTight', fontSize: 12, fontWeight: FontWeight.w700,
            color: selected ? Colors.white : _kMuted,
          )),
        ),
      ),
    );
  }

  Widget _buildChart(List<Map<String, dynamic>> stats, bool isFamily) {
    final maxCnt = stats.fold<double>(0, (m, e) => _n(e['count']) > m ? _n(e['count']) : m);

    return BarChart(
      BarChartData(
        maxY: maxCnt <= 0 ? 1 : maxCnt * 1.25,
        alignment: BarChartAlignment.spaceAround,
        gridData: const FlGridData(show: false),
        borderData: FlBorderData(show: false),
        barTouchData: BarTouchData(
          touchTooltipData: BarTouchTooltipData(
            getTooltipColor: (_) => const Color(0xFF0F172A),
            getTooltipItem: (group, gi, rod, ri) => BarTooltipItem(
              rod.toY.toInt().toString(),
              const TextStyle(
                color: Colors.white, fontFamily: 'InterTight',
                fontSize: 12, fontWeight: FontWeight.w700,
              ),
            ),
          ),
          touchCallback: (event, response) {
            if (event is! FlTapUpEvent) return;
            final idx = response?.spot?.touchedBarGroupIndex;
            if (idx == null || idx < 0 || idx >= stats.length) return;
            final s = stats[idx];
            if (isFamily) {
              widget.onFamilyTap?.call(_s(s['family']));
            } else {
              widget.onDiameterTap?.call(_n(s['diameter']).toInt());
            }
          },
        ),
        titlesData: FlTitlesData(
          leftTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 28,
              getTitlesWidget: (value, meta) {
                final i = value.toInt();
                if (i < 0 || i >= stats.length) return const SizedBox.shrink();
                final s = stats[i];
                final label = isFamily ? _s(s['family']) : 'Ø${_n(s['diameter']).toInt()}';
                return Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(label, style: const TextStyle(
                    fontFamily: 'InterTight', fontSize: 11,
                    fontWeight: FontWeight.w600, color: _kMuted,
                  )),
                );
              },
            ),
          ),
        ),
        barGroups: stats.asMap().entries.map((en) {
          final i     = en.key;
          final s     = en.value;
          final cnt   = _n(s['count']);
          final color = isFamily
              ? (_familyColors[_s(s['family'])] ?? _kMuted)
              : _diameterColor;
          return BarChartGroupData(x: i, barRods: [
            BarChartRodData(
              toY: cnt,
              color: color,
              width: 26,
              borderRadius: BorderRadius.circular(6),
            ),
          ]);
        }).toList(),
      ),
    );
  }
}
