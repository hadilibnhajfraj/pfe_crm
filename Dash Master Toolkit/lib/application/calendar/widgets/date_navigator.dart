import 'package:dash_master_toolkit/application/calendar/calendar_imports.dart';
import 'package:intl/intl.dart';
import 'package:responsive_framework/responsive_framework.dart' as rf;

class DateNavigator extends StatelessWidget {
  const DateNavigator({
    super.key,
    this.onPrevious,
    this.onNext,
    this.currentDate,
    this.viewMode = 'Day',
  });

  final VoidCallback? onPrevious;
  final VoidCallback? onNext;
  final DateTime? currentDate;
  final String viewMode;

  // ✅ Couleurs forcées
  static const Color kText = Color(0xFF111827);
  static const Color kIcon = Color(0xFF111827);
  static const Color kBorder = Color(0xFFE5E7EB);
  static const Color kBtnBg = Colors.white;

  @override
  Widget build(BuildContext context) {
    final bool isMobile = rf.ResponsiveValue<bool>(
      context,
      conditionalValues: const [
        rf.Condition.between(start: 0, end: 675, value: true),
      ],
      defaultValue: false,
    ).value;

    final formattedDate = DateFormat(
      viewMode.trim().toLowerCase() == "day" ? 'dd MMM, yyyy' : 'MMM, yyyy',
    ).format(currentDate ?? DateTime.now());

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      mainAxisSize: isMobile ? MainAxisSize.max : MainAxisSize.min,
      children: [
        IconButton(
          onPressed: onPrevious,
          style: IconButton.styleFrom(
            backgroundColor: kBtnBg,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
            side: isMobile ? BorderSide.none : const BorderSide(color: kBorder),
            padding: EdgeInsets.zero,
          ),
          icon: const Icon(Icons.chevron_left_outlined, color: kIcon),
        ),

        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Text(
            formattedDate,
            style: TextStyle(
              color: kText,
              fontSize: isMobile ? 18 : 16,
              fontWeight: isMobile ? FontWeight.w700 : FontWeight.w600,
            ),
          ),
        ),

        IconButton(
          onPressed: onNext,
          style: IconButton.styleFrom(
            backgroundColor: kBtnBg,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
            side: isMobile ? BorderSide.none : const BorderSide(color: kBorder),
            padding: EdgeInsets.zero,
          ),
          icon: const Icon(Icons.chevron_right_outlined, color: kIcon),
        ),
      ],
    );
  }
}