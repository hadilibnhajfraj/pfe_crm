import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:syncfusion_flutter_calendar/calendar.dart';
import 'package:dash_master_toolkit/services/relance_api.dart';
import 'package:dash_master_toolkit/application/calendar/model/relance_calendar_item.dart';

class FollowupCalendarController extends GetxController {
  var selectedDate = DateTime.now().obs;

  final calendarController = CalendarController();
  var currentView = CalendarView.week.obs;

  var appointments = <Appointment>[].obs;

  // Notes de chaque Appointment = id de la relance ; les données complètes
  // (client, commercial, statut, ...) restent en mémoire ici pour que le
  // dialog de détail les affiche sans requête réseau supplémentaire.
  final Map<String, RelanceCalendarItem> _relancesById = {};

  @override
  void onInit() {
    super.onInit();
    fetchRelances();

    calendarController.addPropertyChangedListener((String property) {
      if (property == 'displayDate') {
        Future.microtask(() {
          selectedDate.value = calendarController.displayDate ?? DateTime.now();
        });
      }
    });

    calendarController.view = CalendarView.week;
  }

  Future<void> fetchRelances() async {
    try {
      final list = await RelanceApi.instance.listRelances();

      _relancesById
        ..clear()
        ..addEntries(list.map((r) => MapEntry(r.id, r)));

      appointments.assignAll(
        list.map((r) {
          final start = r.startDateTime;
          final end = start.add(const Duration(minutes: 30));
          final clientName = r.contact?.fullName ?? "Client";

          return Appointment(
            startTime: start,
            endTime: end,
            subject: "Follow-up - $clientName",
            notes: r.id,
            color: _colorForStatut(r.statutRelance),
          );
        }).toList(),
      );
    } catch (_) {
      appointments.clear();
      _relancesById.clear();
    }
  }

  RelanceCalendarItem? relanceById(String id) => _relancesById[id];

  Color _colorForStatut(String statut) {
    switch (statut) {
      case "faite":
        return const Color(0xFF22C55E);
      case "annulee":
        return const Color(0xFF94A3B8);
      default:
        return const Color(0xFF4F46E5);
    }
  }

  void changeView(CalendarView view) {
    calendarController.view = view;
    currentView.value = view;
  }

  void goToPrevious() => calendarController.backward?.call();
  void goToNext() => calendarController.forward?.call();
}
