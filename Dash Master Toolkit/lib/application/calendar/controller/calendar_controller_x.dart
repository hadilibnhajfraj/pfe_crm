import 'dart:convert';
import 'package:dash_master_toolkit/application/calendar/calendar_imports.dart';
import 'package:dash_master_toolkit/services/task_api.dart';
import 'package:dash_master_toolkit/application/calendar/model/task_model.dart';
import 'package:dash_master_toolkit/application/calendar/model/project_item.dart';
class CalendarControllerX extends GetxController {
  var selectedDate = DateTime.now().obs;

  final calendarController = CalendarController();
  var currentView = CalendarView.week.obs;

  var appointments = <Appointment>[].obs;

  @override
  void onInit() {
    super.onInit();
    loadMyProjects();               // ✅ NEW
    fetchTasksAndBuildCalendar();

    calendarController.addPropertyChangedListener((String property) {
      if (property == 'displayDate') {
        Future.microtask(() {
          selectedDate.value = calendarController.displayDate ?? DateTime.now();
        });
      }
    });

    calendarController.view = CalendarView.week;
  }

  Future<void> fetchTasksAndBuildCalendar() async {
    try {
      final List<TaskModel> tasks = await TaskApi.instance.listTasks();

      appointments.assignAll(
        tasks.map((t) {
          final startLocal = t.startAt.toLocal();
          final endLocal = t.effectiveEndAt.toLocal();

          // ✅ notes = json (propre)
          final notes = jsonEncode({
            "desc": t.description,
            "creatorEmail": t.creatorEmail ?? "",
          });

          return Appointment(
            startTime: startLocal,
            endTime: endLocal,
            subject: t.title,       // ✅ seulement le titre
            notes: notes,           // ✅ meta pour UI
            color: _priorityColor(t.priority),
          );
        }).toList(),
      );
    } catch (_) {
      appointments.clear();
    }
  }

  Future<void> addTask({
    required String title,
    required DateTime start,
    String description = "",
    required String projectId,     // ✅ NEW
  }) async {
    await TaskApi.instance.createTask(
      title: title,
      startAt: start,
      description: description,
      projectId: projectId,         // ✅ NEW
    );
    await fetchTasksAndBuildCalendar();
  }

  void changeView(CalendarView view) {
    calendarController.view = view;
    currentView.value = view;
  }

  // Couleur du rendez-vous selon la priorité de l'action Timeline d'origine
  // (voir ProjectAction.priorite) — retombe sur la couleur historique si
  // absente (Task créée manuellement, sans priorité).
  Color _priorityColor(String? priority) {
    switch (priority) {
      case 'urgente':
        return Colors.red;
      case 'haute':
        return Colors.orange;
      case 'basse':
        return Colors.grey;
      default:
        return colorPrimary100;
    }
  }

  void goToPrevious() => calendarController.backward?.call();
  void goToNext() => calendarController.forward?.call();
  var myProjects = <ProjectItem>[].obs;

Future<void> loadMyProjects() async {
  try {
    final list = await TaskApi.instance.listMyProjects();
    myProjects.assignAll(list);
  } catch (_) {
    myProjects.clear();
  }
}
}
