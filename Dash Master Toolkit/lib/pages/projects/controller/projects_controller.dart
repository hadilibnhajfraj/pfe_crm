import 'package:dash_master_toolkit/pages/projects/projetcs_imports.dart';

class ProjectsController extends GetxController {
  ThemeController themeController = Get.put(ThemeController());

  TextEditingController searchController = TextEditingController();
  FocusNode f1 = FocusNode();

  var selectedIndex = 0.obs;

  void changeTab(int index) {
    selectedIndex.value = index;
  }

  final List<String> tabTitles = [
    "In progress",
    "Incoming",
    "Completed",
    "Archived"
  ];
  final List<int> tabCounts = [9, 2, 1, 0];

  final List<List<ProjectModel>> projects = [
    // In Progress
    [
      ProjectModel(
          title: "Google tracking",
          iconPath: googleAnalyticsIcon,
          deliveryDate: "15 Aug 2021",
          progress: 25,
          teamMembers: [
            profileIcon1,
            profileIcon2,
            profileIcon8,
          ]),
      ProjectModel(
          title: "Dropbox Redesign",
          iconPath: dropboxIcon,
          deliveryDate: "15 Aug 2021",
          progress: 56,
          teamMembers: [
            profileIcon3,
            profileIcon4,
          ]),
      ProjectModel(
          title: "Evernote Calendar",
          iconPath: evernoteIcon,
          deliveryDate: "15 Aug 2021",
          progress: 25,
          teamMembers: [
            profileIcon5,
            profileIcon6,
          ]),
      ProjectModel(
          title: "OneDrive Migration",
          iconPath: evernoteIcon,
          deliveryDate: "15 Aug 2021",
          progress: 76,
          teamMembers: [
            profileIcon5,
            profileIcon6,
          ]),
      ProjectModel(
          title: "Dribble Shots",
          iconPath: dribbbleIcon,
          deliveryDate: "15 Aug 2021",
          progress: 74,
          teamMembers: [
            profileIcon5,
            profileIcon6,
          ]),
      ProjectModel(
          title: "OneDrive Migration",
          iconPath: evernoteIcon,
          deliveryDate: "15 Aug 2021",
          progress: 74,
          teamMembers: [
            profileIcon5,
            profileIcon6,
          ]),
      ProjectModel(
          title: "Google tracking",
          iconPath: googleAnalyticsIcon,
          deliveryDate: "15 Aug 2021",
          progress: 25,
          teamMembers: [
            profileIcon1,
            profileIcon2,
            profileIcon8,
          ]),
      ProjectModel(
          title: "Dropbox Redesign",
          iconPath: dropboxIcon,
          deliveryDate: "15 Aug 2021",
          progress: 56,
          teamMembers: [
            profileIcon3,
            profileIcon4,
          ]),
      ProjectModel(
          title: "Evernote Calendar",
          iconPath: evernoteIcon,
          deliveryDate: "15 Aug 2021",
          progress: 25,
          teamMembers: [
            profileIcon5,
            profileIcon6,
          ]),
    ],
    // Incoming
    [
      ProjectModel(
          title: "Evernote Calendar",
          iconPath: evernoteIcon,
          deliveryDate: "15 Aug 2021",
          progress: 25,
          teamMembers: [
            profileIcon5,
            profileIcon6,
          ]),
    ],
    // Completed
    [
      ProjectModel(
          title: "iOS GUI Kit",
          iconPath: appleIcon,
          deliveryDate: "15 Aug 2021",
          progress: 76,
          teamMembers: [
            profileIcon7,
            profileIcon8,
          ]),
    ],
    // Archived
    [],
  ];
}
