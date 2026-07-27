
import 'package:dash_master_toolkit/forms/form_imports.dart';

class BasicFormFieldsController extends GetxController {
  final nameController = TextEditingController();
  final emailController = TextEditingController();
  final passwordController = TextEditingController();
  final phoneController = TextEditingController();
  final numberController = TextEditingController();
  final notesController = TextEditingController();
  final searchController = TextEditingController();
  final urlController = TextEditingController();
  final otpController = TextEditingController();
  final currencyController = TextEditingController();

  final pickedFileName = ''.obs;

  final fileController = TextEditingController();
  Future<void> pickFile() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.any,
      // allowedExtensions: ['pdf', 'docx', 'jpg'],
    );

    if (result != null && result.files.single.path != null) {
      // final file = File(result.files.single.path!);
      pickedFileName.value = result.files.single.name;
      // Use your file (upload, display name, etc.)
    }
  }

  void clearFile() {
    pickedFileName.value = '';
  }


  final phoneTextController = TextEditingController();
  final phoneFieldFocused = false.obs;


  var isPasswordHidden = true.obs;
  final formKey = GlobalKey<FormState>();
  void togglePasswordVisibility() {
    isPasswordHidden.value = !isPasswordHidden.value;
  }

  var sliderValue = 50.0.obs;
  final dateController = TextEditingController();

  Future<void> pickDate(BuildContext context) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.now(),
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
      dateController.text = '${picked.day}/${picked.month}/${picked.year}';
    }
  }

  final statusController = TextEditingController();

  @override
  void onInit() {
    // Show warning for email by default
    statusController.text="Active";
    emailTextController.text="yourname";
    fieldStates['email'] = FieldState.warning;
    super.onInit();
  }

  final emailFieldFocused = false.obs;
  final emailTextController = TextEditingController();


  // Track field states by field name
  final fieldStates = <String, FieldState>{}.obs;

  // Validation function
  String? validateEmailText(String? value,AppLocalizations lang) {
    if (value == null || value.isEmpty) {
      Future.microtask(() => fieldStates['email'] = FieldState.error);
      return lang.translate('emailIsRequired');
    }
    final emailRegex = RegExp(r'^[\w-\.]+@([\w-]+\.)+[\w]{2,4}$');
    if (!emailRegex.hasMatch(value)) {
      Future.microtask(() => fieldStates['email'] = FieldState.warning);
      return lang.translate('pleaseEnterValidEmail');
    }
    Future.microtask(() => fieldStates['email'] = FieldState.valid);
    return null;
  }
}
enum FieldState { none, valid, warning, error }

