import 'package:get/get.dart';
import 'package:intl/intl.dart';

class Event {
  String eventName = '';
  String eventTime = '';
  String icon = '';

  DateTime dateTime = DateTime.now();

  String ownerName = '';
  String ownerImage = '';
  String description = '';
  String aboutEvents = '';
  String location = '';
  RxBool isBookmark = false.obs;
  int noOfGuests = 0;
  List<EventSpeaker> listOfSpeakers = [];

  Event(
      {required this.eventName,
      required this.eventTime,
      required this.icon,
      required this.dateTime});

  Event.fromJson(Map<String, dynamic> json) {
    eventName = json['eventName'] ?? '';
    eventTime = json['eventTime'] ?? '';
    dateTime = json['dateTime'] != null
        ? DateTime.parse(json['dateTime'])
        : DateTime.now();
    icon = json['icon'] ?? '';
    ownerName = json['ownerName'] ?? '';
    ownerImage = json['ownerImage'] ?? '';
    description = json['description'] ?? '';
    aboutEvents = json['aboutEvents'] ?? '';
    location = json['location'] ?? '';
    noOfGuests = json['noOfGuests'] ?? 0;
    isBookmark.value = json['isBookmark'] ?? false;

    if (json['listOfSpeakers'] != null) {
      listOfSpeakers = (json['listOfSpeakers'] as List)
          .map((section) => EventSpeaker.fromJson(section))
          .toList();
    }
  }

  String get formattedDate => DateFormat("MMM dd, yyyy").format(dateTime);

}

class EventSpeaker {
  String name = '';
  String designation = '';
  String image = '';

  EventSpeaker.fromJson(Map<String, dynamic> json) {
    name = json['name'] ?? '';
    designation = json['designation'] ?? '';
    image = json['image'] ?? '';
  }
}
