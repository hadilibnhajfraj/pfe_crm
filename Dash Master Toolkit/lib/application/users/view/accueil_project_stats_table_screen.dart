import 'dart:convert';
import 'dart:html' as html;
import 'package:flutter/material.dart';
import 'package:dash_master_toolkit/core/config/api_config.dart';
import 'package:dash_master_toolkit/application/users/model/project_stats_model.dart';
import 'package:dash_master_toolkit/application/users/model/project_stats_row_model.dart';
import 'package:dash_master_toolkit/services/project_stats_service.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

class AccueilProjectStatsTableScreen extends StatefulWidget {
  final String token;
  final String userRole;

  const AccueilProjectStatsTableScreen({
    super.key,
    required this.token,
    required this.userRole,
  });

  @override
  State<AccueilProjectStatsTableScreen> createState() =>
      _AccueilProjectStatsTableScreenState();
}

class _AccueilProjectStatsTableScreenState
    extends State<AccueilProjectStatsTableScreen>
    with SingleTickerProviderStateMixin {
  late Future<List<UserProjectSummary>> _future;
  late TabController _tabController;

  final service = ProjectStatsService(
    baseUrl: ApiConfig.baseUrl,
  );

  static const Color kPrimary = Color(0xFF1F6FEB);
  static const Color kBg = Color(0xFFF4F7FC);
  static const Color kCard = Colors.white;
  static const Color kBorder = Color(0xFFE5EAF2);
  static const Color kTextDark = Color(0xFF111827);
  static const Color kTextMuted = Color(0xFF6B7280);

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);

    final role = widget.userRole.trim().toLowerCase();
    if (role == 'accueil') {
      _future = service.fetchProjectsPerUserSummary(token: widget.token);
    } else {
      _future = Future.value(<UserProjectSummary>[]);
    }
  }

  List<ProjectStatsRow> _buildDailyRows(List<UserProjectSummary> items) {
    final List<ProjectStatsRow> rows = [];
    for (final user in items) {
      for (final d in user.daily) {
        rows.add(
          ProjectStatsRow(
            userId: user.userId,
            displayName: user.displayName,
            email: user.email,
            periodType: 'Daily',
            periodLabel: d.day,
            projectsCount: d.projectsCount,
            totalProjects: user.totalProjects,
          ),
        );
      }
    }
    return rows;
  }

  List<ProjectStatsRow> _buildWeeklyRows(List<UserProjectSummary> items) {
    final List<ProjectStatsRow> rows = [];
    for (final user in items) {
      for (final w in user.weekly) {
        rows.add(
          ProjectStatsRow(
            userId: user.userId,
            displayName: user.displayName,
            email: user.email,
            periodType: 'Weekly',
            periodLabel: w.weekStart,
            projectsCount: w.projectsCount,
            totalProjects: user.totalProjects,
          ),
        );
      }
    }
    return rows;
  }

  List<ProjectStatsRow> _buildMonthlyRows(List<UserProjectSummary> items) {
    final List<ProjectStatsRow> rows = [];
    for (final user in items) {
      for (final m in user.monthly) {
        rows.add(
          ProjectStatsRow(
            userId: user.userId,
            displayName: user.displayName,
            email: user.email,
            periodType: 'Monthly',
            periodLabel: m.month,
            projectsCount: m.projectsCount,
            totalProjects: user.totalProjects,
          ),
        );
      }
    }
    return rows;
  }

  int _sumProjects(List<ProjectStatsRow> rows) {
    return rows.fold(0, (sum, row) => sum + row.projectsCount);
  }

  int _countUsers(List<UserProjectSummary> items) => items.length;

  @override
  Widget build(BuildContext context) {
    final role = widget.userRole.trim().toLowerCase();

    if (role != 'accueil') {
      return Scaffold(
        backgroundColor: kBg,
        body: Center(
          child: Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: kCard,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: kBorder),
            ),
            child: Text(
              '${AppLocalizations.of(context).translate('Access is restricted to the accueil role. Received role:')} "$role"',
              style: const TextStyle(
                fontSize: 16,
                color: kTextDark,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: kBg,
      body: FutureBuilder<List<UserProjectSummary>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return Center(
              child: Container(
                margin: const EdgeInsets.all(24),
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: const Color(0xFFFECACA)),
                ),
                child: Text(
                  '${AppLocalizations.of(context).translate('Error')}: ${snapshot.error}',
                  style: const TextStyle(
                    color: Colors.red,
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            );
          }

          final items = snapshot.data ?? [];
          if (items.isEmpty) {
            return Center(
              child: Text(
                AppLocalizations.of(context).translate('No data found.'),
                style: const TextStyle(fontSize: 16, color: kTextMuted),
              ),
            );
          }

          final dailyRows = _buildDailyRows(items);
          final weeklyRows = _buildWeeklyRows(items);
          final monthlyRows = _buildMonthlyRows(items);

          return SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  AppLocalizations.of(context).translate('Project Statistics'),
                  style: const TextStyle(
                    fontSize: 30,
                    fontWeight: FontWeight.w800,
                    color: kTextDark,
                    letterSpacing: -0.5,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  AppLocalizations.of(context)
                      .translate('Detailed project analysis by user with filters, search, sorting, and CSV export.'),
                  style: const TextStyle(
                    fontSize: 15,
                    color: kTextMuted,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 24),
                Wrap(
                  spacing: 16,
                  runSpacing: 16,
                  children: [
                    _KpiCard(
                      title: 'Tracked Users',
                      value: _countUsers(items).toString(),
                      icon: Icons.people_alt_rounded,
                      color: kPrimary,
                    ),
                    _KpiCard(
                      title: 'Daily Total',
                      value: _sumProjects(dailyRows).toString(),
                      icon: Icons.today_rounded,
                      color: const Color(0xFF0EA5E9),
                    ),
                    _KpiCard(
                      title: 'Weekly Total',
                      value: _sumProjects(weeklyRows).toString(),
                      icon: Icons.calendar_view_week_rounded,
                      color: const Color(0xFF10B981),
                    ),
                    _KpiCard(
                      title: 'Monthly Total',
                      value: _sumProjects(monthlyRows).toString(),
                      icon: Icons.bar_chart_rounded,
                      color: const Color(0xFFF59E0B),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                Container(
                  decoration: BoxDecoration(
                    color: kCard,
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(color: kBorder),
                    boxShadow: const [
                      BoxShadow(
                        color: Color(0x14000000),
                        blurRadius: 22,
                        offset: Offset(0, 8),
                      ),
                    ],
                  ),
                  child: Column(
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(20, 20, 20, 10),
                        child: Row(
                          children: [
                            const Icon(Icons.insights_rounded, color: kPrimary, size: 22),
                            const SizedBox(width: 10),
                            Text(
                              AppLocalizations.of(context).translate('Analytics Table'),
                              style: const TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.w700,
                                color: kTextDark,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Container(
                        margin: const EdgeInsets.symmetric(horizontal: 16),
                        padding: const EdgeInsets.all(4),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF3F6FC),
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: TabBar(
                          controller: _tabController,
                          indicator: BoxDecoration(
                            color: kPrimary,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          dividerColor: Colors.transparent,
                          labelColor: Colors.white,
                          unselectedLabelColor: kTextDark,
                          labelStyle: const TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 14,
                          ),
                          tabs: [
                            Tab(text: AppLocalizations.of(context).translate('Daily')),
                            Tab(text: AppLocalizations.of(context).translate('Weekly')),
                            Tab(text: AppLocalizations.of(context).translate('Monthly')),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),
                      SizedBox(
                        height: 760,
                        child: TabBarView(
                          controller: _tabController,
                          children: [
                            StatsDataListView(
                              rows: dailyRows,
                              title: 'Daily Tracking',
                              periodLabelTitle: 'Date',
                              csvFileName: 'daily_stats',
                              badgeColor: const Color(0xFFDBEAFE),
                              badgeTextColor: const Color(0xFF1D4ED8),
                            ),
                            StatsDataListView(
                              rows: weeklyRows,
                              title: 'Weekly Tracking',
                              periodLabelTitle: 'Week',
                              csvFileName: 'weekly_stats',
                              badgeColor: const Color(0xFFD1FAE5),
                              badgeTextColor: const Color(0xFF047857),
                            ),
                            StatsDataListView(
                              rows: monthlyRows,
                              title: 'Monthly Tracking',
                              periodLabelTitle: 'Month',
                              csvFileName: 'monthly_stats',
                              badgeColor: const Color(0xFFFEF3C7),
                              badgeTextColor: const Color(0xFFB45309),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _KpiCard extends StatelessWidget {
  final String title;
  final String value;
  final IconData icon;
  final Color color;

  const _KpiCard({
    required this.title,
    required this.value,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 260,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFE5EAF2)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x14000000),
            blurRadius: 20,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 54,
            height: 54,
            decoration: BoxDecoration(
              color: color.withOpacity(.12),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Icon(icon, color: color, size: 28),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  AppLocalizations.of(context).translate(title),
                  style: const TextStyle(
                    fontSize: 13,
                    color: Color(0xFF6B7280),
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  value,
                  style: const TextStyle(
                    fontSize: 28,
                    color: Color(0xFF111827),
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.4,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class StatsDataListView extends StatefulWidget {
  final List<ProjectStatsRow> rows;
  final String title;
  final String periodLabelTitle;
  final String csvFileName;
  final Color badgeColor;
  final Color badgeTextColor;

  const StatsDataListView({
    super.key,
    required this.rows,
    required this.title,
    required this.periodLabelTitle,
    required this.csvFileName,
    required this.badgeColor,
    required this.badgeTextColor,
  });

  @override
  State<StatsDataListView> createState() => _StatsDataListViewState();
}

class _StatsDataListViewState extends State<StatsDataListView> {
  static const Color kPrimary = Color(0xFF1F6FEB);
  static const Color kBorder = Color(0xFFE5EAF2);
  static const Color kTextDark = Color(0xFF111827);
  static const Color kTextMuted = Color(0xFF6B7280);

  final TextEditingController _searchCtrl = TextEditingController();

  String _search = '';
  String _selectedUser = 'All';
  int _sortColumnIndex = 0;
  bool _sortAscending = true;

  int _page = 0;
  final int _pageSize = 5;

  List<ProjectStatsRow> get _filteredRows {
    List<ProjectStatsRow> data = List<ProjectStatsRow>.from(widget.rows);

    if (_selectedUser != 'All') {
      data = data.where((e) => e.displayName == _selectedUser).toList();
    }

    if (_search.trim().isNotEmpty) {
      final q = _search.toLowerCase().trim();
      data = data.where((e) {
        return e.displayName.toLowerCase().contains(q) ||
            e.email.toLowerCase().contains(q) ||
            e.periodLabel.toLowerCase().contains(q) ||
            e.projectsCount.toString().contains(q) ||
            e.totalProjects.toString().contains(q);
      }).toList();
    }

    data.sort((a, b) {
      dynamic av;
      dynamic bv;

      switch (_sortColumnIndex) {
        case 0:
          av = a.displayName.toLowerCase();
          bv = b.displayName.toLowerCase();
          break;
        case 1:
          av = a.email.toLowerCase();
          bv = b.email.toLowerCase();
          break;
        case 2:
          av = a.periodLabel;
          bv = b.periodLabel;
          break;
        case 3:
          av = a.projectsCount;
          bv = b.projectsCount;
          break;
        case 4:
          av = a.totalProjects;
          bv = b.totalProjects;
          break;
        default:
          av = a.displayName.toLowerCase();
          bv = b.displayName.toLowerCase();
      }

      final result = Comparable.compare(av, bv);
      return _sortAscending ? result : -result;
    });

    return data;
  }

  List<ProjectStatsRow> get _pagedRows {
    final data = _filteredRows;
    final start = _page * _pageSize;
    if (start >= data.length) return [];
    final end = (start + _pageSize > data.length) ? data.length : start + _pageSize;
    return data.sublist(start, end);
  }

  int get _pageCount {
    final len = _filteredRows.length;
    if (len == 0) return 1;
    return (len / _pageSize).ceil();
  }

  List<String> get _userOptions {
    final users = widget.rows.map((e) => e.displayName).toSet().toList()..sort();
    return ['All', ...users];
  }

  int get _filteredProjectsCount {
    return _filteredRows.fold(0, (sum, e) => sum + e.projectsCount);
  }

  void _sort(int columnIndex) {
    setState(() {
      if (_sortColumnIndex == columnIndex) {
        _sortAscending = !_sortAscending;
      } else {
        _sortColumnIndex = columnIndex;
        _sortAscending = true;
      }
      _page = 0;
    });
  }

  void _exportCsv() {
    final rows = _filteredRows;

    final buffer = StringBuffer();
    buffer.writeln('User,Email,${widget.periodLabelTitle},Projects Count,Total Projects,Status');

    for (final r in rows) {
      final status = r.projectsCount > 0 ? 'Active' : 'Empty';
      buffer.writeln(
        '"${_escapeCsv(r.displayName)}","${_escapeCsv(r.email)}","${_escapeCsv(r.periodLabel)}","${r.projectsCount}","${r.totalProjects}","$status"',
      );
    }

    final bytes = utf8.encode(buffer.toString());
    final blob = html.Blob([bytes], 'text/csv;charset=utf-8;');
    final url = html.Url.createObjectUrlFromBlob(blob);

    final anchor = html.AnchorElement(href: url)
      ..setAttribute('download', '${widget.csvFileName}.csv')
      ..click();

    html.Url.revokeObjectUrl(url);
    anchor.remove();
  }

  String _escapeCsv(String value) {
    return value.replaceAll('"', '""');
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final rows = _pagedRows;
    final totalRows = _filteredRows;

    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 0, 18, 18),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: widget.badgeColor,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  '${totalRows.length} ${AppLocalizations.of(context).translate('rows')}',
                  style: TextStyle(
                    color: widget.badgeTextColor,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: const Color(0xFFEEF2FF),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  '${AppLocalizations.of(context).translate('Filtered total')}: $_filteredProjectsCount',
                  style: const TextStyle(
                    color: Color(0xFF4338CA),
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const Spacer(),
              ElevatedButton.icon(
                onPressed: totalRows.isEmpty ? null : _exportCsv,
                icon: const Icon(Icons.download_rounded, size: 18),
                label: Text(AppLocalizations.of(context).translate('Export CSV')),
                style: ElevatedButton.styleFrom(
                  backgroundColor: kPrimary,
                  foregroundColor: Colors.white,
                  elevation: 0,
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFFF8FAFD),
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: kBorder),
            ),
            child: Wrap(
              spacing: 14,
              runSpacing: 14,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                SizedBox(
                  width: 320,
                  child: TextField(
                    controller: _searchCtrl,
                    onChanged: (value) {
                      setState(() {
                        _search = value;
                        _page = 0;
                      });
                    },
                    decoration: InputDecoration(
                      hintText: AppLocalizations.of(context).translate('Search by user, email, period...'),
                      prefixIcon: const Icon(Icons.search_rounded),
                      suffixIcon: _search.isNotEmpty
                          ? IconButton(
                              onPressed: () {
                                _searchCtrl.clear();
                                setState(() {
                                  _search = '';
                                  _page = 0;
                                });
                              },
                              icon: const Icon(Icons.close_rounded),
                            )
                          : null,
                      filled: true,
                      fillColor: Colors.white,
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 14,
                      ),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: const BorderSide(color: kBorder),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: const BorderSide(color: kBorder),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: const BorderSide(color: kPrimary, width: 1.4),
                      ),
                    ),
                  ),
                ),
                SizedBox(
                  width: 260,
                  child: DropdownButtonFormField<String>(
                    value: _selectedUser,
                    items: _userOptions
                        .map(
                          (user) => DropdownMenuItem<String>(
                            value: user,
                            child: Text(AppLocalizations.of(context).translate(user)),
                          ),
                        )
                        .toList(),
                    onChanged: (value) {
                      setState(() {
                        _selectedUser = value ?? 'All';
                        _page = 0;
                      });
                    },
                    decoration: InputDecoration(
                      labelText: AppLocalizations.of(context).translate('Filter by user'),
                      filled: true,
                      fillColor: Colors.white,
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 14,
                      ),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: const BorderSide(color: kBorder),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: const BorderSide(color: kBorder),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: const BorderSide(color: kPrimary, width: 1.4),
                      ),
                    ),
                  ),
                ),
                OutlinedButton.icon(
                  onPressed: () {
                    _searchCtrl.clear();
                    setState(() {
                      _search = '';
                      _selectedUser = 'All';
                      _page = 0;
                    });
                  },
                  icon: const Icon(Icons.refresh_rounded),
                  label: Text(AppLocalizations.of(context).translate('Reset')),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: kTextDark,
                    side: const BorderSide(color: kBorder),
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    backgroundColor: Colors.white,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Expanded(
            child: Container(
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: kBorder),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x0F000000),
                    blurRadius: 16,
                    offset: Offset(0, 8),
                  ),
                ],
              ),
              child: Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 18, 20, 12),
                    child: Row(
                      children: [
                        Text(
                          widget.title,
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                            color: kTextDark,
                          ),
                        ),
                      ],
                    ),
                  ),
                  _HeaderRow(
                    periodLabelTitle: widget.periodLabelTitle,
                    sortColumnIndex: _sortColumnIndex,
                    sortAscending: _sortAscending,
                    onSort: _sort,
                  ),
                  const Divider(height: 1, thickness: 1),
                  Expanded(
                    child: rows.isEmpty
                        ? Center(
                            child: Text(
                              AppLocalizations.of(context).translate('No rows to display.'),
                              style: const TextStyle(
                                fontSize: 15,
                                color: kTextMuted,
                              ),
                            ),
                          )
                        : ListView.separated(
                            padding: const EdgeInsets.symmetric(vertical: 8),
                            itemCount: rows.length,
                            separatorBuilder: (_, __) => const Divider(
                              height: 1,
                              thickness: 1,
                              color: kBorder,
                            ),
                            itemBuilder: (context, index) {
                              final r = rows[index];
                              return _StatsListTile(
                                row: r,
                                periodLabelTitle: widget.periodLabelTitle,
                              );
                            },
                          ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                    decoration: const BoxDecoration(
                      border: Border(
                        top: BorderSide(color: kBorder),
                      ),
                    ),
                    child: Row(
                      children: [
                        Text(
                          '${AppLocalizations.of(context).translate('Page')} ${_page + 1} / $_pageCount',
                          style: const TextStyle(
                            color: kTextMuted,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const Spacer(),
                        OutlinedButton(
                          onPressed: _page > 0
                              ? () {
                                  setState(() {
                                    _page--;
                                  });
                                }
                              : null,
                          child: Text(AppLocalizations.of(context).translate('Previous')),
                        ),
                        const SizedBox(width: 10),
                        ElevatedButton(
                          onPressed: (_page + 1) < _pageCount
                              ? () {
                                  setState(() {
                                    _page++;
                                  });
                                }
                              : null,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: kPrimary,
                            foregroundColor: Colors.white,
                          ),
                          child: Text(AppLocalizations.of(context).translate('Next')),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _HeaderRow extends StatelessWidget {
  final String periodLabelTitle;
  final int sortColumnIndex;
  final bool sortAscending;
  final void Function(int index) onSort;

  const _HeaderRow({
    required this.periodLabelTitle,
    required this.sortColumnIndex,
    required this.sortAscending,
    required this.onSort,
  });

  static const Color kTextDark = Color(0xFF111827);
  static const Color kMuted = Color(0xFF6B7280);

  Widget _header(BuildContext context, String text, int index, {double width = 140}) {
    final isActive = sortColumnIndex == index;
    return InkWell(
      onTap: () => onSort(index),
      child: SizedBox(
        width: width,
        child: Row(
          children: [
            Flexible(
              child: Text(
                AppLocalizations.of(context).translate(text),
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  color: isActive ? kTextDark : kMuted,
                  fontSize: 14,
                ),
              ),
            ),
            const SizedBox(width: 4),
            if (isActive)
              Icon(
                sortAscending ? Icons.arrow_upward : Icons.arrow_downward,
                size: 16,
                color: kTextDark,
              ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 0),
      child: SizedBox(
        height: 52,
        child: Row(
          children: [
            _header(context, 'User', 0, width: 240),
            _header(context, 'Email', 1, width: 270),
            _header(context, periodLabelTitle, 2, width: 140),
            _header(context, 'Projects Count', 3, width: 120),
            _header(context, 'Total Projects', 4, width: 130),
            SizedBox(
              width: 110,
              child: Text(
                AppLocalizations.of(context).translate('Status'),
                style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  color: kMuted,
                  fontSize: 14,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatsListTile extends StatelessWidget {
  final ProjectStatsRow row;
  final String periodLabelTitle;

  const _StatsListTile({
    required this.row,
    required this.periodLabelTitle,
  });

  static const Color kTextDark = Color(0xFF111827);
  static const Color kTextMuted = Color(0xFF6B7280);

  @override
  Widget build(BuildContext context) {
    final isActive = row.projectsCount > 0;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
      child: Row(
        children: [
          SizedBox(
            width: 240,
            child: Row(
              children: [
                CircleAvatar(
                  radius: 22,
                  backgroundColor: const Color(0xFFDBEAFE),
                  child: Text(
                    row.displayName.isNotEmpty ? row.displayName[0].toUpperCase() : '?',
                    style: const TextStyle(
                      color: Color(0xFF1D4ED8),
                      fontWeight: FontWeight.w700,
                      fontSize: 18,
                    ),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Text(
                    row.displayName,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: kTextDark,
                    ),
                  ),
                ),
              ],
            ),
          ),
          SizedBox(
            width: 270,
            child: Text(
              row.email,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 14,
                color: kTextMuted,
              ),
            ),
          ),
          SizedBox(
            width: 140,
            child: Text(
              row.periodLabel,
              style: const TextStyle(
                fontSize: 14,
                color: kTextDark,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          SizedBox(
            width: 120,
            child: Align(
              alignment: Alignment.centerLeft,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                decoration: BoxDecoration(
                  color: const Color(0xFFEEF2FF),
                  borderRadius: BorderRadius.circular(30),
                ),
                child: Text(
                  row.projectsCount.toString(),
                  style: const TextStyle(
                    color: Color(0xFF4338CA),
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          ),
          SizedBox(
            width: 130,
            child: Text(
              row.totalProjects.toString(),
              style: const TextStyle(
                fontSize: 14,
                color: kTextDark,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          SizedBox(
            width: 110,
            child: Align(
              alignment: Alignment.centerLeft,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                decoration: BoxDecoration(
                  color: isActive
                      ? const Color(0xFFDCFCE7)
                      : const Color(0xFFF3F4F6),
                  borderRadius: BorderRadius.circular(30),
                ),
                child: Text(
                  AppLocalizations.of(context).translate(isActive ? 'Active' : 'Empty'),
                  style: TextStyle(
                    color: isActive
                        ? const Color(0xFF166534)
                        : const Color(0xFF6B7280),
                    fontWeight: FontWeight.w700,
                    fontSize: 12,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}