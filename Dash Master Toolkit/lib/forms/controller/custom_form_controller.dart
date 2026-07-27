
import 'package:dash_master_toolkit/forms/form_imports.dart';

class CustomFormController extends GetxController {
  final formKey = GlobalKey<FormState>();

  final firstName = ''.obs;
  final lastName = ''.obs;
  final email = ''.obs;
  final password = ''.obs;
  final phone = ''.obs;
  final gender = ''.obs;
  final acceptTerms = false.obs;
  final selectedSuggestion = ''.obs;
  final maskedInput = ''.obs;

  final age = ''.obs;
  final url = ''.obs;
  final bio = ''.obs;
  final country = ''.obs;
  final dob = ''.obs;
  final income = ''.obs;
  final isSubscribed = false.obs;
  final selectedRating = 3.0.obs;

  List<String> suggestions = ["Flutter", "Dart", "GetX", "Firebase"];

  final selectedCountry = ''.obs;
  final selectedState = ''.obs;
  final selectedCity = ''.obs;

  final countryStateCityMap = {
    'India': {
      'Gujarat': ['Ahmedabad', 'Surat'],
      'Maharashtra': ['Mumbai', 'Pune'],
    },
    'USA': {
      'California': ['Los Angeles', 'San Francisco'],
      'Texas': ['Houston', 'Austin'],
    }
  };
}

