
import 'package:dash_master_toolkit/forms/form_imports.dart';

class ValidationFormFieldsController extends GetxController {
  final formKey = GlobalKey<FormState>();

  final firstName = TextEditingController();
  final lastName =TextEditingController();
  final email = TextEditingController();
  final password = TextEditingController();
  final phone = TextEditingController();
  final acceptTerms = false.obs;
  final submitClick = false.obs;

  var f1=FocusNode();
  var f2=FocusNode();
  var f3=FocusNode();
  var f4=FocusNode();
  var f5=FocusNode();
  var f6=FocusNode();


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
