// lib/forms/view/project_pipeline_screen.dart
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:go_router/go_router.dart';

import '../providers/pipeline_provider.dart';
import 'pipeline_theme.dart';
import 'project_pipeline_board.dart';

// ══════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ══════════════════════════════════════════════════════════════════════════════
class ProjectPipelineScreen extends StatefulWidget {
  const ProjectPipelineScreen({super.key});

  @override
  State<ProjectPipelineScreen> createState() => _ProjectPipelineScreenState();
}

class _ProjectPipelineScreenState extends State<ProjectPipelineScreen>
    with SingleTickerProviderStateMixin {
  late final PipelineProvider _provider;
  late final TextEditingController _searchCtrl;
  late final AnimationController _fadeCtrl;
  late final Animation<double> _fadeAnim;

  @override
  void initState() {
    super.initState();
    _provider = Get.isRegistered<PipelineProvider>()
        ? Get.find<PipelineProvider>()
        : Get.put(PipelineProvider());
    _searchCtrl = TextEditingController();

    _fadeCtrl = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 480));
    _fadeAnim = CurvedAnimation(parent: _fadeCtrl, curve: Curves.easeOut);

    ever(_provider.loading, (bool v) {
      if (!v && mounted) _fadeCtrl.forward(from: 0);
    });
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    _fadeCtrl.dispose();
    super.dispose();
  }

  void _snack(String msg, Color color) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg,
          style:
              tInter(fontSize: 13, fontWeight: FontWeight.w500)),
      backgroundColor: color,
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      margin: const EdgeInsets.all(16),
    ));
  }

  Future<void> _onMove(
      Map<String, dynamic> project, String newStage) async {
    final ok = await _provider.moveProject(project, newStage);
    if (ok) {
      _snack(
          'Moved to ${kCrmStageLabels[newStage] ?? newStage}', kCrmSuccess);
    } else {
      _snack('Move failed — please try again', kCrmDanger);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kCrmBg,
      body: Column(
        children: [
          _PipelineHeader(
            provider: _provider,
            searchCtrl: _searchCtrl,
            onAddProject: () => context.go('/forms/project'),
            onRefresh: () => _provider.load(),
          ),
          // 2-px progress bar during non-first reloads — board stays visible.
          Obx(() => _provider.refreshing.value
              ? LinearProgressIndicator(
                  color: kCrmPrimary,
                  backgroundColor: kCrmPrimary.withOpacity(0.12),
                  minHeight: 2,
                )
              : const SizedBox.shrink()),
          Expanded(
            child: Obx(() {
              if (_provider.loading.value) {
                return const _PipelineShimmer();
              }
              // Error state — only when board is completely empty.
              if (_provider.errorMessage.value != null &&
                  _provider.grouped.values.every((l) => l.isEmpty)) {
                return _PipelineErrorState(
                  message: _provider.errorMessage.value!,
                  onRetry: () => _provider.load(),
                );
              }
              return FadeTransition(
                opacity: _fadeAnim,
                child: PipelineBoard(
                  provider: _provider,
                  onMove: _onMove,
                ),
              );
            }),
          ),
        ],
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// HEADER (KPI strip + search + filters)
// ══════════════════════════════════════════════════════════════════════════════
class _PipelineHeader extends StatelessWidget {
  final PipelineProvider provider;
  final TextEditingController searchCtrl;
  final VoidCallback onAddProject;
  final VoidCallback onRefresh;

  const _PipelineHeader({
    required this.provider,
    required this.searchCtrl,
    required this.onAddProject,
    required this.onRefresh,
  });

  @override
  Widget build(BuildContext context) {
    final w = MediaQuery.of(context).size.width;
    final narrow = w < 720;

    return Container(
      color: kCrmSurface,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Title row ─────────────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 20, 24, 0),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [kCrmPrimary, kCrmSecondary],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(12),
                    boxShadow: [
                      BoxShadow(
                          color: kCrmPrimary.withOpacity(0.3),
                          blurRadius: 10,
                          offset: const Offset(0, 4)),
                    ],
                  ),
                  child: const Icon(Icons.view_kanban_rounded,
                      color: Colors.white, size: 20),
                ),
                const SizedBox(width: 14),
                Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('CRM Sales Pipeline',
                            style: tInter(
                                fontSize: 22,
                                fontWeight: FontWeight.w800,
                                color: kCrmText,
                                letterSpacing: -0.4)),
                        const SizedBox(height: 2),
                        Text(
                          'Gestion intelligente des projets et relances',
                          style: tInter(fontSize: 12, color: kCrmTextSub),
                        ),
                      ],
                    ),
                const Spacer(),
                _iconBtn(Icons.refresh_rounded, onRefresh, 'Refresh'),
                const SizedBox(width: 8),
                _gradientBtn('Add Project', Icons.add_rounded, onAddProject),
              ],
            ),
          ),
          // ── KPI strip ─────────────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 14, 24, 0),
            child: SizedBox(
              height: 72,
              child: Obx(() => ListView(
                    scrollDirection: Axis.horizontal,
                    children: [
                      _kpiTile('Total Projects',
                          provider.total.value.toString(),
                          Icons.folder_open_rounded, kCrmPrimary),
                      _kpiTile('Active',
                          provider.active.value.toString(),
                          Icons.pending_actions_rounded, kCrmInfo),
                      _kpiTile('Won',
                          provider.won.value.toString(),
                          Icons.emoji_events_rounded, kCrmSuccess),
                      _kpiTile('Lost',
                          provider.lost.value.toString(),
                          Icons.cancel_rounded, kCrmDanger),
                      _kpiTile(
                          'Conv. Rate',
                          '${provider.convRate.toStringAsFixed(1)}%',
                          Icons.trending_up_rounded,
                          kCrmWarning),
                      _kpiTile('Archivés',
                          provider.archived.value.toString(),
                          Icons.archive_rounded,
                          const Color(0xFF6B7280)),
                    ],
                  )),
            ),
          ),
          // ── Model tabs (Project / Revendeur / Applicateur) ─────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 12, 24, 0),
            child: Obx(() => SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _modelTab(provider, null,          'All',         Icons.grid_view_rounded),
                      const SizedBox(width: 6),
                      _modelTab(provider, 'project',     'Project',     Icons.business_center_rounded),
                      const SizedBox(width: 6),
                      _modelTab(provider, 'revendeur',   'Revendeur',   Icons.store_rounded),
                      const SizedBox(width: 6),
                      _modelTab(provider, 'applicateur', 'Applicateur', Icons.construction_rounded),
                      const SizedBox(width: 6),
                      _modelTab(provider, '__archive__', 'Archivés',    Icons.archive_rounded,
                          archiveTab: true),
                    ],
                  ),
                )),
          ),
          // ── Search + filters ───────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 10, 24, 16),
            child: Wrap(
              spacing: 10,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                // Search field
                SizedBox(
                  width: narrow ? 200 : 270,
                  height: 38,
                  child: Obx(() => TextField(
                        controller: searchCtrl,
                        onChanged: provider.setSearch,
                        decoration: InputDecoration(
                          hintText: 'Search projects…',
                          hintStyle: tInter(
                              fontSize: 13, color: kCrmTextSub),
                          prefixIcon: const Icon(Icons.search_rounded,
                              size: 16, color: kCrmTextSub),
                          suffixIcon: provider.search.value.isNotEmpty
                              ? IconButton(
                                  icon: const Icon(Icons.close_rounded,
                                      size: 14, color: kCrmTextSub),
                                  onPressed: () {
                                    searchCtrl.clear();
                                    provider.setSearch('');
                                  },
                                )
                              : null,
                          filled: true,
                          fillColor: kCrmBg,
                          contentPadding: const EdgeInsets.symmetric(
                              horizontal: 14, vertical: 8),
                          border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(10),
                              borderSide:
                                  const BorderSide(color: kCrmBorder)),
                          enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(10),
                              borderSide:
                                  const BorderSide(color: kCrmBorder)),
                          focusedBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(10),
                              borderSide: const BorderSide(
                                  color: kCrmPrimary, width: 1.5)),
                        ),
                        style: tInter(
                            fontSize: 13, color: kCrmText),
                      )),
                ),
                // My Projects toggle
                Obx(() => _filterChip(
                      'My Projects',
                      provider.myOnly.value,
                      Icons.person_rounded,
                      provider.toggleMyOnly,
                    )),
                // Stage filter
                Obx(() => _stageDropdown(
                    provider.filterStage.value, provider.stages,
                    provider.setFilterStage)),
                // Clear filters
                Obx(() {
                  if (!provider.hasActiveFilters) return const SizedBox.shrink();
                  return GestureDetector(
                    onTap: () {
                      searchCtrl.clear();
                      provider.clearFilters();
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 7),
                      decoration: BoxDecoration(
                        color: kCrmDanger.withOpacity(0.06),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                            color: kCrmDanger.withOpacity(0.4)),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.filter_alt_off_rounded,
                              size: 13, color: kCrmDanger),
                          const SizedBox(width: 5),
                          Text('Clear',
                              style: tInter(
                                  fontSize: 12, color: kCrmDanger)),
                        ],
                      ),
                    ),
                  );
                }),
              ],
            ),
          ),
          Container(height: 1, color: kCrmBorder),
        ],
      ),
    );
  }

  Widget _kpiTile(
      String label, String val, IconData icon, Color color) {
    return Container(
      width: 148,
      margin: const EdgeInsets.only(right: 10),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [color.withOpacity(0.1), color.withOpacity(0.04)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withOpacity(0.22)),
        boxShadow: [
          BoxShadow(
              color: color.withOpacity(0.06),
              blurRadius: 8,
              offset: const Offset(0, 2))
        ],
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(7),
            decoration: BoxDecoration(
                color: color.withOpacity(0.15),
                borderRadius: BorderRadius.circular(9)),
            child: Icon(icon, color: color, size: 14),
          ),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(val,
                  style: tInter(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: color,
                      height: 1.1)),
              Text(label,
                  style: tInter(
                      fontSize: 10, color: kCrmTextSub)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _filterChip(
      String label, bool selected, IconData icon, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: selected ? kCrmPrimary.withOpacity(0.1) : kCrmBg,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
              color: selected ? kCrmPrimary : kCrmBorder,
              width: selected ? 1.5 : 1),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon,
                size: 13,
                color: selected ? kCrmPrimary : kCrmTextSub),
            const SizedBox(width: 5),
            Text(label,
                style: tInter(
                    fontSize: 12,
                    fontWeight:
                        selected ? FontWeight.w600 : FontWeight.w500,
                    color: selected ? kCrmPrimary : kCrmTextSub)),
          ],
        ),
      ),
    );
  }

  Widget _stageDropdown(String? sel, List<PipelineStage> stages,
      ValueChanged<String?> onChange) {
    return Container(
      height: 36,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        color: sel != null ? kCrmPrimary.withOpacity(0.08) : kCrmBg,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
            color: sel != null ? kCrmPrimary : kCrmBorder,
            width: sel != null ? 1.5 : 1),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String?>(
          value: sel,
          isDense: true,
          hint: Text('All Stages',
              style: tInter(
                  fontSize: 12, color: kCrmTextSub)),
          style: tInter(
              fontSize: 12,
              color: sel != null ? kCrmPrimary : kCrmText),
          icon: Icon(Icons.keyboard_arrow_down_rounded,
              size: 16,
              color: sel != null ? kCrmPrimary : kCrmTextSub),
          items: [
            DropdownMenuItem<String?>(
                value: null,
                child: Text('All Stages',
                    style: tInter(fontSize: 12))),
            ...stages.map((s) => DropdownMenuItem<String?>(
                  value: s.id,
                  child: Row(children: [
                    Container(
                        width: 8,
                        height: 8,
                        decoration: BoxDecoration(
                            color: s.color,
                            shape: BoxShape.circle)),
                    const SizedBox(width: 8),
                    Text(s.label,
                        style: tInter(fontSize: 12)),
                  ]),
                )),
          ],
          onChanged: onChange,
        ),
      ),
    );
  }

  Widget _modelTab(PipelineProvider provider, String? modele, String label,
      IconData icon, {bool archiveTab = false}) {
    final archiveColor = const Color(0xFF6B7280);
    final activeColor  = archiveTab ? archiveColor : kCrmPrimary;

    // Archive tab is "selected" when filterStage is 'archive-stage'
    final bool selected = archiveTab
        ? provider.filterStage.value == 'archive-stage'
        : provider.filterModele.value == modele;

    return GestureDetector(
      onTap: () {
        if (archiveTab) {
          // Toggle: show only the archive column
          if (provider.filterStage.value == 'archive-stage') {
            provider.setFilterStage(null);
          } else {
            provider.setFilterStage('archive-stage');
          }
        } else {
          provider.setFilterModele(modele);
          provider.setFilterStage(null); // clear archive filter
        }
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
        decoration: BoxDecoration(
          color: selected ? activeColor : kCrmBg,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
              color: selected ? activeColor : kCrmBorder,
              width: selected ? 1.5 : 1),
          boxShadow: selected
              ? [BoxShadow(
                  color: activeColor.withOpacity(0.25),
                  blurRadius: 6,
                  offset: const Offset(0, 2))]
              : null,
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon,
              size: 13,
              color: selected ? Colors.white : (archiveTab ? archiveColor : kCrmTextSub)),
          const SizedBox(width: 5),
          Text(label,
              style: tInter(
                  fontSize: 12,
                  fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                  color: selected ? Colors.white : (archiveTab ? archiveColor : kCrmTextSub))),
        ]),
      ),
    );
  }

  Widget _iconBtn(IconData icon, VoidCallback onTap, String tooltip) {
    return Tooltip(
      message: tooltip,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
              border: Border.all(color: kCrmBorder),
              borderRadius: BorderRadius.circular(10),
              color: kCrmSurface),
          child: Icon(icon, size: 17, color: kCrmTextSub),
        ),
      ),
    );
  }

  Widget _gradientBtn(String label, IconData icon, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
              colors: [kCrmPrimary, kCrmSecondary],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight),
          borderRadius: BorderRadius.circular(10),
          boxShadow: [
            BoxShadow(
                color: kCrmPrimary.withOpacity(0.35),
                blurRadius: 10,
                offset: const Offset(0, 4))
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: Colors.white, size: 15),
            const SizedBox(width: 6),
            Text(label,
                style: tInter(
                    color: Colors.white,
                    fontWeight: FontWeight.w600,
                    fontSize: 13)),
          ],
        ),
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SHIMMER LOADING
// ══════════════════════════════════════════════════════════════════════════════
class _PipelineShimmer extends StatefulWidget {
  const _PipelineShimmer();

  @override
  State<_PipelineShimmer> createState() => _PipelineShimmerState();
}

class _PipelineShimmerState extends State<_PipelineShimmer>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _anim;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 1100))
      ..repeat(reverse: true);
    _anim = Tween(begin: 0.3, end: 0.8)
        .animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeInOut));
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // LayoutBuilder gives us the real available height so shimmer cards
    // are sized to fit exactly — no BOTTOM OVERFLOW regardless of screen size.
    return LayoutBuilder(
      builder: (_, constraints) {
        // Budget for card content after vertical padding (20 top + 20 bottom),
        // stage-header placeholder (56 px) and the gap below it (12 px).
        // 3 cards are shown; between adjacent cards there is a 10-px spacer.
        // Formula: available = 56 + 12 + 3*cardH + 2*10  → cardH = (avail-88)/3
        final avail  = constraints.maxHeight - 40; // subtract padding
        final cardH  = ((avail - 88) / 3).clamp(60.0, 160.0);
        final colH   = (88 + 3 * cardH).clamp(0.0, avail);

        return SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.all(20),
          child: AnimatedBuilder(
            animation: _anim,
            builder: (_, __) => Opacity(
              opacity: _anim.value,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: List.generate(
                  5,
                  (_) => SizedBox(
                    width: 300,
                    height: colH,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Stage header placeholder
                        _shimmerBox(56, 14),
                        const SizedBox(height: 12),
                        // 3 card placeholders — exactly fills colH
                        _shimmerBox(cardH, 16),
                        const SizedBox(height: 10),
                        _shimmerBox(cardH, 16),
                        const SizedBox(height: 10),
                        _shimmerBox(cardH, 16),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _shimmerBox(double h, double r) => Container(
        height: h,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [
              kCrmBorder,
              kCrmBorder.withOpacity(0.5),
              kCrmBorder
            ],
            stops: const [0.0, 0.5, 1.0],
          ),
          borderRadius: BorderRadius.circular(r),
        ),
      );
}

// ══════════════════════════════════════════════════════════════════════════════
// ERROR STATE
// ══════════════════════════════════════════════════════════════════════════════
class _PipelineErrorState extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _PipelineErrorState({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(40),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: kCrmDanger.withOpacity(0.07),
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.cloud_off_rounded,
                  size: 44, color: kCrmDanger),
            ),
            const SizedBox(height: 20),
            Text('Failed to load pipeline',
                style: tInter(
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                    color: kCrmText)),
            const SizedBox(height: 8),
            Text(
              message,
              textAlign: TextAlign.center,
              style: tInter(fontSize: 13, color: kCrmTextSub),
            ),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh_rounded, size: 16),
              label: Text('Retry',
                  style: tInter(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: Colors.white)),
              style: FilledButton.styleFrom(
                backgroundColor: kCrmPrimary,
                padding:
                    const EdgeInsets.symmetric(horizontal: 28, vertical: 12),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
