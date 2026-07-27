import 'package:dash_master_toolkit/application/calendar/calendar_imports.dart';
import 'package:dash_master_toolkit/application/calendar/widgets/add_new_task_dialog.dart';
import 'package:responsive_framework/responsive_framework.dart' as rf;
import 'package:intl/intl.dart';

class CalendarHeader extends StatefulWidget {
  const CalendarHeader({super.key});

  @override
  State<CalendarHeader> createState() => _CalendarHeaderState();
}

class _CalendarHeaderState extends State<CalendarHeader> {
  final CalendarControllerX controller = Get.find();

  /// ✅ NEW: open AddTaskDialog (with projects dropdown) + send projectId
  Future<void> createNewTaskDialog(ThemeData theme, BuildContext context) async {
    // ✅ Load projects if not loaded yet
    if (controller.myProjects.isEmpty) {
      await controller.loadMyProjects();
    }

    if (controller.myProjects.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("No projects available for your account.")),
      );
      return;
    }

    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      barrierDismissible: true,
      builder: (_) => AddTaskDialog(projects: controller.myProjects),
    );

    if (result == null) return;

    await controller.addTask(
      title: (result["title"] ?? "").toString(),
      start: result["start"] as DateTime,
      description: (result["description"] ?? "").toString(),
      projectId: (result["projectId"] ?? "").toString(), // ✅ IMPORTANT
    );
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final lang = AppLocalizations.of(context);

    final isMobile = rf.ResponsiveValue<bool>(
      context,
      conditionalValues: const [
        rf.Condition.between(start: 0, end: 768, value: true),
      ],
      defaultValue: false,
    ).value;

    return Obx(
      () => Padding(
        padding: EdgeInsets.all(isMobile ? 0 : 10.0),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              mainAxisAlignment:
                  isMobile ? MainAxisAlignment.center : MainAxisAlignment.spaceBetween,
              crossAxisAlignment:
                  isMobile ? CrossAxisAlignment.start : CrossAxisAlignment.center,
              children: [
                if (!isMobile) _buildDateSelector(),
                Expanded(
                  child: Row(
                    mainAxisAlignment:
                        isMobile ? MainAxisAlignment.spaceBetween : MainAxisAlignment.end,
                    children: [
                      CalendarToggleButtons(
                        isMobile: isMobile,
                        currentView: controller.currentView.value,
                        onViewChanged: (newView) => controller.changeView(newView),
                      ),
                      if (!isMobile) const SizedBox(width: 15),
                      Flexible(child: _buildAddTaskButton(theme, lang)),
                    ],
                  ),
                ),
              ],
            ),
            if (isMobile) const SizedBox(height: 15),
            if (isMobile) _buildDateSelector(),
          ],
        ),
      ),
    );
  }

  /// Date Navigator (Previous, Current, Next)
  Widget _buildDateSelector() {
    return Obx(
      () => DateNavigator(
        onPrevious: controller.goToPrevious,
        onNext: controller.goToNext,
        currentDate: controller.selectedDate.value,
        viewMode: controller.currentView.value == CalendarView.day ? "Day" : "Month",
      ),
    );
  }

  /// "Add New Task" Button
  Widget _buildAddTaskButton(ThemeData theme, AppLocalizations lang) {
    return IntrinsicWidth(
      child: CommonButtonWithIcon(
        backgroundColor: colorPrimary100,
        onPressed: () async {
          await createNewTaskDialog(theme, context); // ✅ async
        },
        text: lang.translate('addNewTask'),
      ),
    );
  }
}
