import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:dash_master_toolkit/application/calendar/model/project_item.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';
class AddTaskDialog extends StatefulWidget {
   final List<ProjectItem> projects;

  const AddTaskDialog({super.key, required this.projects});

  @override
  State<AddTaskDialog> createState() => _AddTaskDialogState();
}

class _AddTaskDialogState extends State<AddTaskDialog> {
  // Controllers
  final _title = TextEditingController();
  final _desc = TextEditingController();
  final _startDateCtrl = TextEditingController();
  final _startTimeCtrl = TextEditingController();
ProjectItem? _selectedProject;

@override
void initState() {
  super.initState();
  if (widget.projects.isNotEmpty) {
    _selectedProject = widget.projects.first;
  }
}
  DateTime? _startDate;
  TimeOfDay? _startTime;

  // Couleurs forcées
  static const Color kPrimary = Color(0xFF1976D2);
  static const Color kPickerCardBg = Color(0xFFEAF0FF); // bg pickers
  static const Color kDialogBg = Color(0xFFF3F6FF); // bg dialog
  static const Color kFieldBg = Color(0xFFEAF0FF); // bg inputs
  static const Color kTextDark = Color(0xFF111827);

  @override
  void dispose() {
    _title.dispose();
    _desc.dispose();
    _startDateCtrl.dispose();
    _startTimeCtrl.dispose();
    super.dispose();
  }

  InputDecoration _dec(String label, String hint, IconData icon) {
    return InputDecoration(
      labelText: AppLocalizations.of(context).translate(label),
      hintText: AppLocalizations.of(context).translate(hint),
      filled: true,
      fillColor: kFieldBg,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: kPrimary.withOpacity(.25)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: kPrimary, width: 2),
      ),
      labelStyle: const TextStyle(color: kTextDark, fontWeight: FontWeight.w700),
      hintStyle: TextStyle(color: Colors.grey.shade700),
      suffixIcon: Icon(icon, color: kPrimary),
    );
  }

  ThemeData _dialogTheme() {
    return ThemeData.light(useMaterial3: true).copyWith(
      colorScheme: const ColorScheme.light(
        primary: kPrimary,
        onPrimary: Colors.white,
        surface: kDialogBg,
        onSurface: kTextDark,
      ),
      dialogTheme: const DialogThemeData(
        backgroundColor: kDialogBg,
        surfaceTintColor: Colors.transparent,
      ),
    );
  }

 Future<void> _pickDate() async {
  final now = DateTime.now();

  final picked = await showDatePicker(
    context: context,
    initialDate: _startDate ?? now,
    firstDate: DateTime(now.year - 1, 1, 1),
    lastDate: DateTime(now.year + 3, 12, 31),

    // ✅ IMPORTANT : on force le mode input (plus de grille calendrier)
    initialEntryMode: DatePickerEntryMode.input,

    cancelText: AppLocalizations.of(context).translate("Cancel"),
    confirmText: AppLocalizations.of(context).translate("Save"),

    builder: (ctx, child) {
      return Theme(
        data: ThemeData.light(useMaterial3: true).copyWith(
          colorScheme: const ColorScheme.light(
            primary: kPrimary,
            onPrimary: Colors.white,
            surface: kPickerCardBg,
            onSurface: kTextDark,
          ),
          dialogTheme: const DialogThemeData(
            backgroundColor: kPickerCardBg,
            surfaceTintColor: Colors.transparent,
          ),
          datePickerTheme: const DatePickerThemeData(
            backgroundColor: kPickerCardBg,
            surfaceTintColor: Colors.transparent,
            headerBackgroundColor: kPickerCardBg,
          ),
          textButtonTheme: TextButtonThemeData(
            style: TextButton.styleFrom(
              foregroundColor: kPrimary,
              textStyle: const TextStyle(fontWeight: FontWeight.w800),
            ),
          ),
        ),
        child: child!,
      );
    },
  );

  if (picked == null) return;

  setState(() {
    _startDate = picked;
    _startDateCtrl.text = DateFormat("yyyy-MM-dd").format(picked);
  });
}

  // ✅ TimePicker custom (AM/PM bleu + dropdown hour/minute)
 Future<void> _pickTime() async {
  final picked = await showTimePicker(
    context: context,
    initialTime: _startTime ?? TimeOfDay.now(),

    // ✅ IMPORTANT : mode input (pas de cadran)
    initialEntryMode: TimePickerEntryMode.input,

    builder: (ctx, child) {
      return Theme(
        data: ThemeData.light(useMaterial3: true).copyWith(
          colorScheme: const ColorScheme.light(
            primary: kPrimary,
            onPrimary: Colors.white,
            surface: kPickerCardBg,
            onSurface: kTextDark,
          ),
          dialogTheme: const DialogThemeData(
            backgroundColor: kPickerCardBg,
            surfaceTintColor: Colors.transparent,
          ),
          timePickerTheme: const TimePickerThemeData(
            backgroundColor: kPickerCardBg,
            hourMinuteColor: Colors.white,      // champ HH:MM
            hourMinuteTextColor: kTextDark,
            dayPeriodColor: Colors.white,       // AM/PM zone
            dayPeriodTextColor: kTextDark,
            dialBackgroundColor: kPickerCardBg,
            dialHandColor: kPrimary,
            entryModeIconColor: kPrimary,
          ),
          textButtonTheme: TextButtonThemeData(
            style: TextButton.styleFrom(
              foregroundColor: kPrimary,
              textStyle: const TextStyle(fontWeight: FontWeight.w800),
            ),
          ),
        ),
        child: child!,
      );
    },
  );

  if (picked == null) return;

  setState(() {
    _startTime = picked;
    _startTimeCtrl.text = picked.format(context);
  });
}

  DateTime? _buildStartDateTime() {
    if (_startDate == null || _startTime == null) return null;
    return DateTime(
      _startDate!.year,
      _startDate!.month,
      _startDate!.day,
      _startTime!.hour,
      _startTime!.minute,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Theme(
      data: _dialogTheme(),
      child: AlertDialog(
        backgroundColor: kDialogBg,
        surfaceTintColor: Colors.transparent,
        title: Text(
          AppLocalizations.of(context).translate("ADD New Task"),
          style: const TextStyle(color: kTextDark, fontWeight: FontWeight.w900),
        ),
        content: SizedBox(
          width: 520,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: _title,
                style: const TextStyle(color: kTextDark, fontWeight: FontWeight.w600),
                decoration: _dec("Title", "Enter Title", Icons.title),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _startDateCtrl,
                      readOnly: true,
                      onTap: _pickDate,
                      style: const TextStyle(color: kTextDark, fontWeight: FontWeight.w700),
                      decoration: _dec("Start Date", "Select Start Date", Icons.calendar_month_outlined),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextFormField(
                      controller: _startTimeCtrl,
                      readOnly: true,
                      onTap: _pickTime,
                      style: const TextStyle(color: kTextDark, fontWeight: FontWeight.w700),
                      decoration: _dec("Start Time", "Select Start Time", Icons.access_time),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _desc,
                maxLines: 3,
                style: const TextStyle(color: kTextDark, fontWeight: FontWeight.w600),
                decoration: _dec("Description", "Enter here", Icons.notes),
              ),
              const SizedBox(height: 12),

DropdownButtonFormField<ProjectItem>(
  value: _selectedProject,
  items: widget.projects.map<DropdownMenuItem<ProjectItem>>((ProjectItem p) {
    return DropdownMenuItem<ProjectItem>(
      value: p,
      child: Text(p.nomProjet, overflow: TextOverflow.ellipsis),
    );
  }).toList(),
  onChanged: (ProjectItem? v) => setState(() => _selectedProject = v),
  decoration: _dec("Project", "Select project", Icons.business_center_outlined),
),
            ],
          ),
        ),
        actions: [
          OutlinedButton(
            style: OutlinedButton.styleFrom(
              foregroundColor: kPrimary,
              side: const BorderSide(color: kPrimary),
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            onPressed: () => Navigator.pop(context, null),
            child: Text(AppLocalizations.of(context).translate("Cancel")),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: kPrimary,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 12),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            onPressed: () {
              final start = _buildStartDateTime();
              if (_title.text.trim().isEmpty || start == null) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text(AppLocalizations.of(context)
                      .translate("Title + Start date/time are required"))),
                );
                return;
              }
              Navigator.pop(context, {
                "title": _title.text.trim(),
                "start": start,
                "description": _desc.text.trim(),
                "projectId": _selectedProject!.id,     // ✅ NEW
              });
            },
            child: Text(AppLocalizations.of(context).translate("Save")),
          ),
        ],
      ),
    );
  }
}

/* -------------------- CUSTOM DATE PICKER -------------------- */

class _CustomDatePickerDialog extends StatefulWidget {
  final DateTime initialDate;
  final Color primary;
  final Color bg;
  final Color text;

  const _CustomDatePickerDialog({
    required this.initialDate,
    required this.primary,
    required this.bg,
    required this.text,
  });

  @override
  State<_CustomDatePickerDialog> createState() => _CustomDatePickerDialogState();
}

class _CustomDatePickerDialogState extends State<_CustomDatePickerDialog> {
  late DateTime _viewMonth;
  late DateTime _selected;

  @override
  void initState() {
    super.initState();
    _selected = DateTime(widget.initialDate.year, widget.initialDate.month, widget.initialDate.day);
    _viewMonth = DateTime(_selected.year, _selected.month, 1);
  }

  void _prevMonth() => setState(() => _viewMonth = DateTime(_viewMonth.year, _viewMonth.month - 1, 1));
  void _nextMonth() => setState(() => _viewMonth = DateTime(_viewMonth.year, _viewMonth.month + 1, 1));

  bool _sameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  @override
  Widget build(BuildContext context) {
    final monthTitle = DateFormat("MMMM yyyy").format(_viewMonth);

    final firstWeekday = _viewMonth.weekday; // Mon=1..Sun=7
    final startOffset = firstWeekday % 7;    // Sun=0, Mon=1, ...

    final daysInMonth = DateTime(_viewMonth.year, _viewMonth.month + 1, 0).day;
    final totalCells = ((startOffset + daysInMonth) <= 35) ? 35 : 42;

    return Dialog(
      backgroundColor: widget.bg,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: SizedBox(
        width: 640,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  Text("Select date", style: TextStyle(color: widget.text, fontWeight: FontWeight.w900)),
                  const Spacer(),
                  Text(monthTitle, style: TextStyle(color: widget.text, fontWeight: FontWeight.w800)),
                  const SizedBox(width: 8),
                  IconButton(onPressed: _prevMonth, icon: Icon(Icons.chevron_left, color: widget.text)),
                  IconButton(onPressed: _nextMonth, icon: Icon(Icons.chevron_right, color: widget.text)),
                ],
              ),
              const SizedBox(height: 10),
              const Row(
                children: [
                  _Wd("S"), _Wd("M"), _Wd("T"), _Wd("W"), _Wd("T"), _Wd("F"), _Wd("S"),
                ],
              ),
              const SizedBox(height: 6),

              GridView.builder(
                shrinkWrap: true,
                itemCount: totalCells,
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 7,
                  mainAxisSpacing: 6,
                  crossAxisSpacing: 6,
                ),
                itemBuilder: (_, i) {
                  final dayNum = i - startOffset + 1;
                  if (dayNum < 1 || dayNum > daysInMonth) return const SizedBox();

                  final date = DateTime(_viewMonth.year, _viewMonth.month, dayNum);
                  final isSelected = _sameDay(date, _selected);

                  return InkWell(
                    borderRadius: BorderRadius.circular(999),
                    onTap: () => setState(() => _selected = date),
                    child: Container(
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: isSelected ? widget.primary : Colors.transparent,
                        borderRadius: BorderRadius.circular(999),
                        border: isSelected ? null : Border.all(color: widget.primary.withOpacity(.15)),
                      ),
                      child: Text(
                        "$dayNum",
                        style: TextStyle(
                          fontWeight: FontWeight.w800,
                          color: isSelected ? Colors.white : widget.text,
                        ),
                      ),
                    ),
                  );
                },
              ),

              const SizedBox(height: 14),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: widget.primary,
                        side: BorderSide(color: widget.primary),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      onPressed: () => Navigator.pop(context, null),
                      child: const Text("Cancel"),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: widget.primary,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      onPressed: () => Navigator.pop(context, _selected),
                      child: const Text("Save"),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Wd extends StatelessWidget {
  final String t;
  const _Wd(this.t);
  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Center(
        child: Text(t, style: const TextStyle(fontWeight: FontWeight.w800)),
      ),
    );
  }
}

/* -------------------- CUSTOM TIME PICKER -------------------- */

class _CustomTimePickerDialog extends StatefulWidget {
  final TimeOfDay initial;
  final Color primary;
  final Color bg;
  final Color text;

  const _CustomTimePickerDialog({
    required this.initial,
    required this.primary,
    required this.bg,
    required this.text,
  });

  @override
  State<_CustomTimePickerDialog> createState() => _CustomTimePickerDialogState();
}

class _CustomTimePickerDialogState extends State<_CustomTimePickerDialog> {
  late int hour12;
  late int minute;
  late bool isPm;

  @override
  void initState() {
    super.initState();
    isPm = widget.initial.period == DayPeriod.pm;
    hour12 = widget.initial.hourOfPeriod == 0 ? 12 : widget.initial.hourOfPeriod;
    minute = widget.initial.minute;
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: widget.bg,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: SizedBox(
        width: 520,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Align(
                alignment: Alignment.centerLeft,
                child: Text("Select time", style: TextStyle(color: widget.text, fontWeight: FontWeight.w900)),
              ),
              const SizedBox(height: 12),

              // AM/PM bleu
              Container(
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: widget.primary.withOpacity(.25)),
                ),
                child: Row(
                  children: [
                    Expanded(child: _ampm("AM", selected: !isPm, onTap: () => setState(() => isPm = false))),
                    Expanded(child: _ampm("PM", selected: isPm, onTap: () => setState(() => isPm = true))),
                  ],
                ),
              ),
              const SizedBox(height: 14),

              Row(
                children: [
                  Expanded(
                    child: _ddCard(
                      label: "Hour",
                      child: DropdownButton<int>(
                        value: hour12,
                        isExpanded: true,
                        underline: const SizedBox(),
                        items: List.generate(12, (i) => i + 1)
                            .map((h) => DropdownMenuItem(value: h, child: Text(h.toString().padLeft(2, '0'))))
                            .toList(),
                        onChanged: (v) => setState(() => hour12 = v ?? hour12),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _ddCard(
                      label: "Minute",
                      child: DropdownButton<int>(
                        value: minute,
                        isExpanded: true,
                        underline: const SizedBox(),
                        items: List.generate(60, (i) => i)
                            .map((m) => DropdownMenuItem(value: m, child: Text(m.toString().padLeft(2, '0'))))
                            .toList(),
                        onChanged: (v) => setState(() => minute = v ?? minute),
                      ),
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 16),

              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: widget.primary,
                        side: BorderSide(color: widget.primary),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      onPressed: () => Navigator.pop(context, null),
                      child: const Text("Cancel"),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: widget.primary,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      onPressed: () {
                        int h = hour12 % 12;
                        if (isPm) h += 12;
                        Navigator.pop(context, TimeOfDay(hour: h, minute: minute));
                      },
                      child: const Text("Save"),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _ampm(String label, {required bool selected, required VoidCallback onTap}) {
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: selected ? widget.primary : Colors.transparent,
          borderRadius: label == "AM"
              ? const BorderRadius.horizontal(left: Radius.circular(12))
              : const BorderRadius.horizontal(right: Radius.circular(12)),
        ),
        child: Center(
          child: Text(
            label,
            style: TextStyle(fontWeight: FontWeight.w800, color: selected ? Colors.white : widget.text),
          ),
        ),
      ),
    );
  }

  Widget _ddCard({required String label, required Widget child}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: widget.primary.withOpacity(.25)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(fontWeight: FontWeight.w800, color: widget.text)),
          const SizedBox(height: 6),
          child,
        ],
      ),
    );
  }
}