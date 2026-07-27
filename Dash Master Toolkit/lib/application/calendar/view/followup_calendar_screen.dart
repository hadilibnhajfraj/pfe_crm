import 'package:dash_master_toolkit/application/calendar/calendar_imports.dart';
import 'package:dash_master_toolkit/application/calendar/controller/followup_calendar_controller.dart';
import 'package:dash_master_toolkit/application/calendar/widgets/followup_detail_dialog.dart';
import 'package:responsive_framework/responsive_framework.dart' as rf;

class FollowupCalendarScreen extends StatelessWidget {
  final FollowupCalendarController controller = Get.put(FollowupCalendarController());

  FollowupCalendarScreen({super.key});

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
            _FollowupCalendarHeader(controller: controller),
            Expanded(
              child: Obx(() {
                return SfCalendar(
                  headerHeight: 0,
                  controller: controller.calendarController,
                  dataSource: _FollowupAppointmentDataSource(controller.appointments.toList()),
                  backgroundColor: themeController.isDarkMode ? colorGrey900 : kCalendarBg,
                  timeSlotViewSettings: const TimeSlotViewSettings(
                    startHour: 5,
                    endHour: 18,
                    timeIntervalHeight: 70,
                  ),
                  allowedViews: const [CalendarView.day, CalendarView.week, CalendarView.month],
                  showNavigationArrow: true,
                  todayHighlightColor: Colors.red,
                  showCurrentTimeIndicator: true,
                  initialDisplayDate: DateTime.now(),
                  onTap: (CalendarTapDetails details) async {
                    if (details.targetElement != CalendarElement.appointment) return;
                    final appointments = details.appointments;
                    if (appointments == null || appointments.isEmpty) return;

                    final tapped = appointments.first as Appointment;
                    final relanceId = (tapped.notes ?? "").toString();
                    final relance = controller.relanceById(relanceId);
                    if (relance == null) return;

                    await showFollowupDetailDialog(context, relance);
                    await controller.fetchRelances();
                  },
                  appointmentBuilder: (context, details) {
                    final Appointment a = details.appointments.first as Appointment;

                    return LayoutBuilder(
                      builder: (_, c) {
                        final h = c.maxHeight;
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
                              child: Text(
                                a.subject,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: titleStyle,
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

class _FollowupAppointmentDataSource extends CalendarDataSource {
  _FollowupAppointmentDataSource(List<Appointment> source) {
    appointments = source;
  }
}

class _FollowupCalendarHeader extends StatelessWidget {
  final FollowupCalendarController controller;
  const _FollowupCalendarHeader({required this.controller});

  @override
  Widget build(BuildContext context) {
    final isMobile = rf.ResponsiveValue<bool>(
      context,
      conditionalValues: const [
        rf.Condition.between(start: 0, end: 768, value: true),
      ],
      defaultValue: false,
    ).value;

    return Obx(
      () => Padding(
        padding: EdgeInsets.all(isMobile ? 8.0 : 10.0),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            if (!isMobile)
              const Text(
                "Calendrier Follow-up",
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
              ),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                DateNavigator(
                  onPrevious: controller.goToPrevious,
                  onNext: controller.goToNext,
                  currentDate: controller.selectedDate.value,
                  viewMode: controller.currentView.value == CalendarView.day ? "Day" : "Month",
                ),
                const SizedBox(width: 12),
                CalendarToggleButtons(
                  isMobile: isMobile,
                  currentView: controller.currentView.value,
                  onViewChanged: (newView) => controller.changeView(newView),
                ),
                const SizedBox(width: 8),
                IconButton(
                  tooltip: "Rafraîchir",
                  onPressed: () => controller.fetchRelances(),
                  icon: const Icon(Icons.refresh_rounded),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
