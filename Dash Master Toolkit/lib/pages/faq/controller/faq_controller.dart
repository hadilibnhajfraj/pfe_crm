import 'package:dash_master_toolkit/pages/faq/faq_imports.dart';

class FaqController extends GetxController {
  // faqs list are in languages file in assets folder
  final List<FaqData> faqs = [
    FaqData(
      question: 'faq1',
      answer: 'faq1Ans',
      isSelected: true
    ),
    FaqData(
      question: 'faq2',
      answer: 'faq2Ans',
    ),
    FaqData(
      question: 'faq3',
      answer: 'faq3Ans',
    ),
    FaqData(
      question: 'faq4',
      answer: 'faq4Ans',
    ),
    FaqData(
      question: 'faq5',
      answer: 'faq5Ans',
    ),
    FaqData(
      question: 'faq6',
      answer: 'faq6Ans',
    ),
    FaqData(
      question: 'faq7',
      answer: 'faq7Ans',
    ),
    FaqData(
      question: 'faq8',
      answer: 'faq8Ans',
    ),
    FaqData(
      question: 'faq9',
      answer: 'faq9Ans',
    ),
    FaqData(
      question: 'faq10',
      answer: 'faq10Ans',
    ),
    FaqData(
      question: 'faq11',
      answer: 'faq1Ans',
    ),
    FaqData(
      question: 'faq11',
      answer: 'faq1Ans',
    ),
    FaqData(
      question: 'faq12',
      answer: 'faq12Ans',
    ),
    FaqData(
      question: 'faq13',
      answer: 'faq13Ans',
    )
  ];

  void toggleExpansion(int index, RxBool isSelected) {
    isSelected.value = !isSelected.value;
  }
}
