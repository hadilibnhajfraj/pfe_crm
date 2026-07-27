import 'package:dash_master_toolkit/application/calendar/calendar_imports.dart';

class CommonSearchField extends StatelessWidget {
  final TextEditingController controller;
  final FocusNode focusNode;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;

  final bool isDarkMode;
  final Color? borderColor;
  final Color? textColor;
  final double? borderRadius;
  final double? height;
  final InputDecoration inputDecoration;

  const CommonSearchField({
    super.key,
    required this.controller,
    required this.focusNode,
    this.onChanged,
    this.onSubmitted,
    required this.isDarkMode,
    required this.inputDecoration,
    this.borderRadius,
    this.borderColor,
    this.height,
    this.textColor,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      height: height ?? 45,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(borderRadius ?? 8),
        border: Border.all(
          color: borderColor ?? (isDarkMode ? colorGrey700 : colorGrey100),
        ),
      ),
      child: TextFormField(
          controller: controller,
          focusNode: focusNode,
          style: Theme.of(context).textTheme.bodyLarge?.copyWith(
              color: textColor ?? (isDarkMode ? colorWhite : colorGrey900)),
          textInputAction: TextInputAction.search,
          keyboardType: TextInputType.text,
          onChanged: onChanged,
          onFieldSubmitted: (value) {
            focusNode.unfocus();
            if (onSubmitted != null) {
              onSubmitted!(value);
            }
          },
          decoration: inputDecoration),
    );
  }
}
