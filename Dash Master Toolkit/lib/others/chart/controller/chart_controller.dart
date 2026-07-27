
import 'package:dash_master_toolkit/others/chart/chart_imports.dart';

class ChartController extends GetxController {

  final List<double> monthlySales = [
    12000, 15000, 18000, 14000, 17000, 21000,
    23000, 19000, 25000, 27000, 30000, 28000,
  ];

  final List<String> monthLabels = const [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  int get currentMonthIndex => DateTime.now().month - 1;


  final monthlyActivity = <ActivityData>[
    ActivityData(pilates: 2, workouts: 5, cycling: 3), // Jan
    ActivityData(pilates: 2, workouts: 6, cycling: 2), // Feb
    ActivityData(pilates: 1, workouts: 4, cycling: 4), // Mar
    ActivityData(pilates: 3, workouts: 6, cycling: 5), // Apr
    ActivityData(pilates: 1, workouts: 4, cycling: 4), // May
    ActivityData(pilates: 2, workouts: 7, cycling: 3), // Jun
    ActivityData(pilates: 1, workouts: 4, cycling: 2), // Jul
    ActivityData(pilates: 2, workouts: 5, cycling: 4), // Aug
    ActivityData(pilates: 2, workouts: 6, cycling: 4), // Sep
    ActivityData(pilates: 1, workouts: 4, cycling: 3), // Oct
    ActivityData(pilates: 1, workouts: 5, cycling: 4), // Nov
    ActivityData(pilates: 2, workouts: 6, cycling: 4), // Dec
  ].obs;

  var touchedIndex = (-1).obs; // -1 = nothing selected

  var routineData = <RoutineCategory>[
    RoutineCategory(name: "Sleep", hours: 7.5, color: colorGrey500),
    RoutineCategory(name: "Work", hours: 9.0, color: colorPrimary100),
    RoutineCategory(name: "Exercise", hours: 1.0, color: colorError100),
    RoutineCategory(name: "Leisure", hours: 3.0, color: colorWarning100),
    RoutineCategory(name: "Others", hours: 3.5, color: colorPortgage100),
  ].obs;
}
