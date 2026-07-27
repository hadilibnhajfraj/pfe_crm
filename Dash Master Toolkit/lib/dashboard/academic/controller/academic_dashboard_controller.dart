import 'package:dash_master_toolkit/dashboard/academic/academic_imports.dart';

class AcademicDashboardController extends GetxController {
  ThemeController themeController = Get.put(ThemeController());
  TextEditingController searchController = TextEditingController();
  FocusNode f1 = FocusNode();

  List<String> lessonPeriodList = ['This Week', "This Month", "This Year"];
  var selectedPeriod = 'This Week'.obs; // Observable variable
  var selectedHours = 'This Week'.obs; // Observable variable

  Future<void> updatePeriod(String newPeriod) async {
    selectedPeriod.value = newPeriod;
  }

  Future<void> updateHours(String newPeriod) async {
    selectedHours.value = newPeriod;
  }

  List<double> quizValues = [3, 6, 2, 8, 3, 4, 5, 6];
  List<double> answerValues = [1, 3, 5, 6, 7, 8, 9];

  RxList<Course> listOfCourse = <Course>[].obs;
  RxList<Course> filteredCourseList = <Course>[].obs;
  var searchQuery = ''.obs; // Observable variable for the search query

  var isLoading = true.obs;

  Future<List<Course>> getCourseList() async {
    listOfCourse.clear();
    String jsonData =
        await rootBundle.loadString('${eduTechDataPath}course_list.json');
    dynamic data = json.decode(jsonData);
    List<dynamic> jsonArray = data['course_list'];

    for (int i = 0; i < jsonArray.length; i++) {
      listOfCourse.add(Course.fromJson(jsonArray[i]));
    }
    isLoading.value = false;
    filteredCourseList.value = List.from(listOfCourse);
    return listOfCourse;
  }

  @override
  void onInit() {
    getCourseList();
    _loadDummyEvents();
    super.onInit();
  }

  // Filter the list based on the search query
  void searchCourse(String query) {
    searchQuery.value = query;
    if (query.isEmpty) {
      // If the search query is empty, show the full list
      filteredCourseList.value = List.from(listOfCourse);
    } else {
      // Filter the list based on the name
      filteredCourseList.value = listOfCourse
          .where((lang) =>
              lang.courseName.toLowerCase().contains(query.toLowerCase()))
          .toList();
    }
  }

  var selectedDate = DateTime.now().obs; // Observable selected date
  var focusedDate = DateTime.now().obs;
  var listOfEvents = <DateTime, List<Event>>{}.obs;

  void _loadDummyEvents() {
    DateTime today = DateTime.now();
    DateTime normalizedToday =
        DateTime(today.year, today.month, today.day); // Reset time to 00:00:00

    listOfEvents.value = {
      normalizedToday: [
        Event(
            eventName: 'Element of Design Test',
            eventTime: '10:00 - 11:00 AM',
            icon: 'https://i.ibb.co/Vphf8XZF/i1.png',
            dateTime: normalizedToday),
        Event(
          eventName: 'Design Principle Test',
          eventTime: '10:00 - 11:00 AM',
          icon: 'https://i.ibb.co/7JCD7MKT/flash.png',
          dateTime: normalizedToday,
        ),
        Event(
          eventName: 'Design Principle Test',
          eventTime: '10:00 - 11:00 AM',
          icon: 'https://i.ibb.co/7JCD7MKT/flash.png',
          dateTime: normalizedToday,
        ),
        Event(
            eventName: 'Prepare Job Interview',
            eventTime: '09:00 - 10:30 AM',
            icon: 'https://i.ibb.co/9kySNR5B/i3.png',
            dateTime: normalizedToday)
      ],
      normalizedToday.add(Duration(days: 1)): [
        Event(
          eventName: 'Design Principle Test',
          eventTime: '10:00 - 11:00 AM',
          icon: 'https://i.ibb.co/7JCD7MKT/flash.png',
          dateTime: normalizedToday.add(
            Duration(days: 1),
          ),
        ),
        Event(
          eventName: 'Prepare Job Interview',
          eventTime: '09:00 - 10:30 AM',
          icon: 'https://i.ibb.co/9kySNR5B/i3.png',
          dateTime: normalizedToday.add(
            Duration(days: 1),
          ),
        )
      ],
    };
  }

  List<Event> getEventsForDay(DateTime day) {
    return listOfEvents[DateTime(day.year, day.month, day.day)] ?? [];
  }

  void onDaySelected(DateTime selected, DateTime focused) {
    selectedDate.value = selected;
    focusedDate.value = focused;
  }
}
