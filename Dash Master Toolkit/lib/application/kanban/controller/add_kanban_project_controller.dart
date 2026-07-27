


import '../kanban_imports.dart';

class AddKanbanProjectController extends GetxController {
  var selectedEmployees = <TaskEmployee>[].obs;
  var saveButtonClicked = false.obs;
  final formKey = GlobalKey<FormState>();
  final nameController = TextEditingController();
  TextEditingController startDateController = TextEditingController();
  TextEditingController endDateController = TextEditingController();
  TextEditingController descriptionController = TextEditingController();
  TextEditingController priorityController = TextEditingController();

  var selectedPriority = ''.obs;
  final List<String> priorityOptions = ['High', 'Medium', 'Low'];

  FocusNode f1 = FocusNode();
  FocusNode f2 = FocusNode();
  FocusNode f3 = FocusNode();
  FocusNode f4 = FocusNode();
  FocusNode f5 = FocusNode();

  final nameFieldFocused = false.obs;
  final startDateFieldFocused = false.obs;
  final endDateFieldFocused = false.obs;
  final descriptionFieldFocused = false.obs;
  final priorityFieldFocused = false.obs;

  var selectedStartDate = Rxn<DateTime>();
  var selectedEndDate = Rxn<DateTime>();

  Future<void> selectStartDate(BuildContext context) async {
    DateTime? picked = await showDatePicker(
      context: context,
      initialDate: selectedStartDate.value ?? DateTime.now(),
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
      builder: (context, child) {
        return Theme(
          // Customize the theme of the date picker dialog here
          data: ThemeData.light().copyWith(
            // primaryColor: colorPrimary100,
            // Change primary color
            hoverColor: Colors.transparent,
            highlightColor: Colors.transparent,
            splashColor: Colors.transparent,
            colorScheme: ColorScheme.light(primary: colorPrimary100),
            // Change color scheme
            dialogBackgroundColor: Colors.white, // Change background color
            // Add more customizations as needed
          ),
          child: child!,
        );
      },
    );
    if (picked != null) {
      selectedStartDate.value = picked;
      startDateController.text = picked.toString().split(' ')[0];
    }
  }

  Future<void> selectEndDate(BuildContext context) async {
    if (selectedStartDate.value == null) {
      toast(
        "Error:  Please select the Start Date first",
      );
      return;
    }

    DateTime? picked = await showDatePicker(
      context: context,
      initialDate: selectedEndDate.value ?? selectedStartDate.value!,
      firstDate: selectedStartDate.value!,
      // Prevents selecting before start date
      lastDate: DateTime(2100),
      builder: (context, child) {
        return Theme(
          // Customize the theme of the date picker dialog here
          data: ThemeData.light().copyWith(
            // primaryColor: colorPrimary100,
            // Change primary color
            hoverColor: Colors.transparent,
            highlightColor: Colors.transparent,
            splashColor: Colors.transparent,
            colorScheme: ColorScheme.light(primary: colorPrimary100),
            // Change color scheme
            dialogBackgroundColor: Colors.white, // Change background color
            // Add more customizations as needed
          ),
          child: child!,
        );
      },
    );

    if (picked != null) {
      selectedEndDate.value = picked;
      endDateController.text = picked.toString().split(' ')[0];
    }
  }

  void clearForm() {
    Get.delete<AddKanbanProjectController>();
  }
}
