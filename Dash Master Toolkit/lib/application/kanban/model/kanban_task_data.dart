import '../kanban_imports.dart';


class KanbanTaskData extends AppFlowyGroupItem{
  final String taskId;
  final String title;
  final String description;
  final String priority;
  final DateTime startDate;
  final DateTime endDate;
  final List<TaskEmployee> users;

  KanbanTaskData(
      this.taskId, {
        required this.title,
        required this.description,
        required this.priority,
        required this.startDate,
        required this.endDate,
        required this.users,
      });

  @override
  String get id => taskId;

  @override
  String toString() {
    return 'KanbanTaskData('
        '$taskId,'
        'title: $title,'
        'description: $description,'
        'priority: $priority,'
        'startDate:$startDate,'
        'endDate:$endDate,'
        'users: ${users.map((e) => e.toString())}'
        ')';
  }
}

class TaskEmployee {
  final DateTime registeredOn;
  final String userName;
  final String imagePath;
  final String email;
  final String phoneNumber;
  final String position;
  final bool isActive;

  const TaskEmployee({
    required this.registeredOn,
    required this.userName,
    required this.imagePath,
    required this.email,
    required this.phoneNumber,
    required this.position,
    required this.isActive,
  });

  @override
  String toString() {
    return 'TaskEmployee { '
        'registeredOn: $registeredOn, '
        'userName: $userName, '
        'imagePath: $imagePath, '
        'email: $email, '
        'phoneNumber: $phoneNumber, '
        'position: $position, '
        'isActive: $isActive '
        '}';
  }
}

final List<TaskEmployee> listOfTaskEmployee = [
  TaskEmployee(
      registeredOn: DateTime.now(),
      userName: "John Doe",
      imagePath: profileIcon1,
      email: "johndoe@example.com",
      phoneNumber: "1234567890",
      position: "Developer",
      isActive: true),
  TaskEmployee(
      registeredOn: DateTime.now(),
      userName: "Jane Smith",
      imagePath: profileIcon2,
      email: "janesmith@example.com",
      phoneNumber: "0987654321",
      position: "Designer",
      isActive: false),
  TaskEmployee(
      registeredOn: DateTime.now(),
      userName: "Alice Johnson",
      imagePath:  profileIcon3,
      email: "alice@example.com",
      phoneNumber: "1122334455",
      position: "Manager",
      isActive: true),
  TaskEmployee(
      registeredOn: DateTime.now(),
      userName: "Bob Brown",
      imagePath:  profileIcon4,
      email: "bob@example.com",
      phoneNumber: "2233445566",
      position: "QA Engineer",
      isActive: true),
  TaskEmployee(
      registeredOn: DateTime.now(),
      userName: "Charlie Wilson",
      imagePath:  profileIcon5,
      email: "charlie@example.com",
      phoneNumber: "3344556677",
      position: "HR",
      isActive: false),
  TaskEmployee(
      registeredOn: DateTime.now(),
      userName: "David Clark",
      imagePath:  profileIcon6,
      email: "david@example.com",
      phoneNumber: "4455667788",
      position: "Scrum Master",
      isActive: true),
  TaskEmployee(
      registeredOn: DateTime.now(),
      userName: "Eve Lewis",
      imagePath:  profileIcon7,
      email: "eve@example.com",
      phoneNumber: "5566778899",
      position: "Product Owner",
      isActive: true),
  TaskEmployee(
      registeredOn: DateTime.now(),
      userName: "Frank White",
      imagePath:  profileIcon8,
      email: "frank@example.com",
      phoneNumber: "6677889900",
      position: "Support Engineer",
      isActive: false),
  TaskEmployee(
      registeredOn: DateTime.now(),
      userName: "Grace Hall",
      imagePath:  profileIcon9,
      email: "grace@example.com",
      phoneNumber: "7788990011",
      position: "Business Analyst",
      isActive: true),
  TaskEmployee(
      registeredOn: DateTime.now(),
      userName: "Henry Scott",
      imagePath:  profileIcon10,
      email: "henry@example.com",
      phoneNumber: "8899001122",
      position: "Data Scientist",
      isActive: false),
];


String generateRandomId([int length = 10]) {
  const String chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  final Random random = Random();
  return String.fromCharCodes(
    Iterable.generate(
      length,
          (_) => chars.codeUnitAt(random.nextInt(chars.length)),
    ),
  );
}