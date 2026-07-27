
import '../kanban_imports.dart';


class KanbanController extends GetxController {
  final AppFlowyBoardController controller = AppFlowyBoardController(
    onMoveGroup: (fromGroupId, fromIndex, toGroupId, toIndex) {
      debugPrint('Move item from $fromIndex to $toIndex');
    },
    onMoveGroupItem: (groupId, fromIndex, toIndex) {
      debugPrint('Move $groupId:$fromIndex to $groupId:$toIndex');
    },
    onMoveGroupItemToGroup: (fromGroupId, fromIndex, toGroupId, toIndex) {
      debugPrint('Move $fromGroupId:$fromIndex to $toGroupId:$toIndex');
    },
  );

  final boardScrollController = AppFlowyBoardScrollController();

  void initializeBoard() {
    final groups = [
      AppFlowyGroupData(id: "To Do", name: "To Do", items: [
        KanbanTaskData(
          generateRandomId(),
          title: "IOS App Home Page",
          description:
              "There are many variations of passages of Lorem Ipsum available.",
          priority: "High",
          startDate: DateTime.now(),
          endDate: DateTime.now().add(Duration(days: 2)),
          users: listOfTaskEmployee.take(5).toList(),
        ),
        KanbanTaskData(
          generateRandomId(),
          title: "Write a release note",
          description:
              "There are many variations of passages of Lorem Ipsum available.",
          priority: "Medium",
          startDate: DateTime.now(),
          endDate: DateTime.now().add(Duration(days: 3)),
          users: listOfTaskEmployee.take(5).toList(),
        ),
        KanbanTaskData(generateRandomId(),
            title: "Brand logo design",
            description:
                "Various versions have evolved over the years, sometimes by accident.",
            priority: "Low",
            startDate: DateTime.now(),
            endDate: DateTime.now().add(Duration(days: 30)),
            users: listOfTaskEmployee.take(2).toList()),
      ]),
      AppFlowyGroupData(id: "In Progress", name: "In Progress", items: [
        KanbanTaskData(
          generateRandomId(),
          title: "Enable analytics tracking",
          description:
              "It has roots in a piece of classical Latin Literature from 45 BC.",
          priority: "Low",
          startDate: DateTime.now(),
          endDate: DateTime.now().add(Duration(days: 1)),
          users: listOfTaskEmployee.take(5).toList(),
        ),
        KanbanTaskData(generateRandomId(),
            title: "Kanban board design",
            description:
                "All the Lorem Ipsum generators on the Internet tend to repeat predefined.",
            priority: "Medium",
            startDate: DateTime.now(),
            endDate: DateTime.now().add(Duration(days: 17)),
            users: listOfTaskEmployee.take(3).toList()),
      ]),
    ];

    for (var group in groups) {
      controller.addGroup(group);
    }
  }
}
