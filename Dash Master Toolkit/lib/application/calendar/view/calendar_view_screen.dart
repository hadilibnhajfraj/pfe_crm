import 'dart:convert';
import 'package:dash_master_toolkit/application/calendar/calendar_imports.dart';
import 'package:responsive_framework/responsive_framework.dart' as rf;

class CalendarViewScreen extends StatelessWidget {
  final CalendarControllerX controller = Get.put(CalendarControllerX());

  CalendarViewScreen({super.key});

  static const Color kCalendarCardBg = Color(0xFFF3F6FF);
  static const Color kCalendarBg = Color(0xFFEFF4FF);

  @override
  Widget build(BuildContext context) {
    ThemeController themeController = Get.put(ThemeController());

    return Scaffold(
      body: Container(
        margin: EdgeInsets.all(
          rf.ResponsiveValue<double>(
            context,
            conditionalValues: const [
              rf.Condition.between(start: 0, end: 340, value: 10),
              rf.Condition.between(start: 341, end: 992, value: 16),
            ],
            defaultValue: 24,
          ).value,
        ),
        constraints: BoxConstraints.tight(
          Size(double.maxFinite, MediaQuery.of(context).size.height * 0.80),
        ),
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: themeController.isDarkMode ? colorGrey900 : kCalendarCardBg,
          borderRadius: BorderRadius.circular(10),
          border: rf.ResponsiveBreakpoints.of(context).largerThan(BreakpointName.MD.name)
              ? Border.all(
                  color: themeController.isDarkMode ? colorGrey500 : colorGrey400,
                  strokeAlign: BorderSide.strokeAlignInside,
                  width: 1,
                )
              : null,
        ),
        child: Column(
          children: [
            CalendarHeader(),
            Expanded(
              child: Obx(() {
                return SfCalendar(
                  headerHeight: 0,
                  controller: controller.calendarController,
                  dataSource: _AppointmentDataSource(controller.appointments.toList()),
                  backgroundColor: themeController.isDarkMode ? colorGrey900 : kCalendarBg,

                  // ✅ un peu plus haut => RDV plus lisible (optionnel mais recommandé)
                  timeSlotViewSettings: const TimeSlotViewSettings(
                    startHour: 5,
                    endHour: 18,
                    timeIntervalHeight: 70, // 🔥 au lieu de 60
                  ),

                  allowedViews: const [CalendarView.day, CalendarView.week, CalendarView.month],
                  showNavigationArrow: true,
                  todayHighlightColor: Colors.red,
                  showCurrentTimeIndicator: true,
                  initialDisplayDate: DateTime.now(),

                  appointmentBuilder: (context, details) {
  final Appointment a = details.appointments.first as Appointment;

  String creatorEmail = "";
  String desc = "";
  if ((a.notes ?? "").toString().isNotEmpty) {
    try {
      final m = jsonDecode(a.notes!) as Map<String, dynamic>;
      creatorEmail = (m["creatorEmail"] ?? "").toString();
      desc = (m["desc"] ?? "").toString();
    } catch (_) {}
  }

  return LayoutBuilder(
    builder: (_, c) {
      final h = c.maxHeight;

      final line1 = creatorEmail.isNotEmpty
          ? "${a.subject} — $creatorEmail"
          : a.subject;

      final canShowSecondLine = h >= 34 && desc.trim().isNotEmpty;

      // 🔥 si la hauteur est trop petite, on compacte (1 seule ligne + padding réduit)
      final compact = h < 28;

      final pad = compact
          ? const EdgeInsets.symmetric(horizontal: 6, vertical: 1)
          : const EdgeInsets.symmetric(horizontal: 6, vertical: 2);

      final titleStyle = TextStyle(
        color: Colors.white,
        fontWeight: FontWeight.w700,
        fontSize: compact ? 10 : 11,
        height: 1.0,
      );

      final descStyle = const TextStyle(
        color: Colors.white,
        fontWeight: FontWeight.w500,
        fontSize: 10,
        height: 1.0,
      );

      return ClipRRect(
        borderRadius: BorderRadius.circular(6),
        child: Container(
          padding: pad,
          decoration: BoxDecoration(
            color: a.color,
            border: Border.all(color: Colors.black.withOpacity(.08)),
          ),
          child: Align(
            alignment: Alignment.centerLeft,
            child: Column(
              mainAxisSize: MainAxisSize.min, // ✅ évite l’overflow vertical
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  line1,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: titleStyle,
                ),
                if (!compact && canShowSecondLine) ...[
                  const SizedBox(height: 2),
                  Text(
                    desc.trim(),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: descStyle,
                  ),
                ],
              ],
            ),
          ),
        ),
      );
    },
  );
},
                );
              }),
            ),
          ],
        ),
      ),
    );
  }
}

class _AppointmentDataSource extends CalendarDataSource {
  _AppointmentDataSource(List<Appointment> source) {
    appointments = source;
  }
}
