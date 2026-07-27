import 'package:get/get.dart';

class FaqData {
  final String question;
  final String answer;
  RxBool isSelected = false.obs;

  FaqData(
      {required this.question, required this.answer, bool isSelected = false})
      : isSelected = isSelected.obs;
}
