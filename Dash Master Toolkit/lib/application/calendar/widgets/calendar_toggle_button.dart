import 'package:dash_master_toolkit/application/calendar/calendar_imports.dart';

class CalendarToggleButtons extends StatefulWidget {
  final CalendarView currentView;
  final Function(CalendarView) onViewChanged;
  final bool isMobile;

  const CalendarToggleButtons({
    super.key,
    required this.currentView,
    required this.onViewChanged,
    required this.isMobile,
  });

  @override
  State<CalendarToggleButtons> createState() => _CalendarToggleButtonsState();
}

class _CalendarToggleButtonsState extends State<CalendarToggleButtons> {
  late CalendarView _selectedView;

  final List<CalendarView> _views = const [
    CalendarView.day,
    CalendarView.week,
    CalendarView.month,
  ];

  // ✅ Couleurs forcées (peu importe light/dark)
  static const Color kSelectedBg = Color(0xFF1976D2); // Bleu
  static const Color kSelectedText = Colors.white;

  static const Color kUnselectedBg = Colors.transparent;
  static const Color kUnselectedText = Color(0xFF111827); // Gris très foncé

  static const Color kBorder = Color(0xFF1976D2); // Bleu bordure

  @override
  void initState() {
    super.initState();
    _selectedView = widget.currentView;
  }

  @override
  Widget build(BuildContext context) {
    final lang = AppLocalizations.of(context);

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        ToggleButtons(
          isSelected: _views.map((view) => view == _selectedView).toList(),
          onPressed: (index) {
            setState(() => _selectedView = _views[index]);
            widget.onViewChanged(_selectedView);
          },
          borderRadius: BorderRadius.circular(8),

          // ✅ forcé
          selectedColor: kSelectedText,
          color: kUnselectedText,
          fillColor: kSelectedBg,
          borderColor: kBorder,
          selectedBorderColor: kBorder,

          textStyle: const TextStyle(fontWeight: FontWeight.w600),
          constraints: BoxConstraints(minWidth: widget.isMobile ? 45 : 75),

          children: _views.map((view) {
            final isSelected = view == _selectedView;

            return Container(
              color: isSelected ? kSelectedBg : kUnselectedBg,
              padding: EdgeInsets.symmetric(
                vertical: widget.isMobile ? 10 : 8,
                horizontal: 10,
              ),
              child: Text(
                _getViewLabel(view, lang),
                style: TextStyle(
                  fontWeight: FontWeight.w600,
                  color: isSelected ? kSelectedText : kUnselectedText,
                ),
              ),
            );
          }).toList(),
        ),
      ],
    );
  }

  String _getViewLabel(CalendarView view, AppLocalizations lang) {
    switch (view) {
      case CalendarView.day:
        return lang.translate('Daily');
      case CalendarView.week:
        return lang.translate('Weekly');
      case CalendarView.month:
        return lang.translate('Monthly');
      default:
        return 'View';
    }
  }
}