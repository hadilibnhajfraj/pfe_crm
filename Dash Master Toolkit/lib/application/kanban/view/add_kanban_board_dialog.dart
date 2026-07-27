import '../kanban_imports.dart';
import 'package:responsive_grid/responsive_grid.dart';

class AddKanbanBoardDialog extends StatefulWidget {
  const AddKanbanBoardDialog({super.key});

  @override
  State<AddKanbanBoardDialog> createState() => _AddKanbanBoardDialogState();
}

class _AddKanbanBoardDialogState extends State<AddKanbanBoardDialog> {
  final _formKey = GlobalKey<FormState>();
  late final boardNameController = TextEditingController();
  Color selectedColor = colorPrimary100;
  ThemeController themeController = Get.put(ThemeController());

  @override
  Widget build(BuildContext context) {
    final lang = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final isMobile = responsiveValue<bool>(
      context,
      xs: true,
      sm: true,
      md: false,
      lg: false,
      xl: false,
    );
    final nameFieldFocused = false.obs;

    return Dialog(
      backgroundColor: themeController.isDarkMode ? colorGrey900 : colorWhite,
      insetPadding: const EdgeInsets.symmetric(horizontal: 16),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
      ),
      clipBehavior: Clip.antiAliasWithSaveLayer,
      child: GestureDetector(
        onTap: () => FocusScope.of(context).unfocus(),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 610),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Padding(
                padding: EdgeInsets.symmetric(
                    horizontal: isMobile ? 10 : 20, vertical: 10),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      lang.translate('addNewBoard'),
                      style: theme.textTheme.titleLarge
                          ?.copyWith(fontWeight: FontWeight.w600, fontSize: 18),
                    ),
                    InkWell(
                      onTap: () {
                        Navigator.pop(context);
                      },
                      child: SvgPicture.asset(
                        cancelIcon,
                        width: 24,
                        height: 24,
                        colorFilter: ColorFilter.mode(
                            themeController.isDarkMode
                                ? colorWhite
                                : colorGrey900,
                            BlendMode.srcIn),
                      ),
                    )
                  ],
                ),
              ),

              Divider(
                color: themeController.isDarkMode ? colorGrey700 : colorGrey100,
              ),

              // Form
              Flexible(
                child: Form(
                  key: _formKey,
                  child: SingleChildScrollView(
                    padding: EdgeInsets.symmetric(
                        horizontal: isMobile ? 10 : 20, vertical: 10),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          lang.translate('boardName'),
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: themeController.isDarkMode
                                ? colorGrey600
                                : colorGrey300,
                            fontWeight: FontWeight.w400,
                          ),
                        ),
                        const SizedBox(height: 10),
                        // Board Name
                        Obx(
                          () => TextFormField(
                            controller: boardNameController,
                            decoration: inputDecoration(context,
                                hintText: lang.translate('boardName')),
                            validator: (value) => validateText(
                              value,
                              lang.translate('boardNameIsRequired'),
                            ),
                            onChanged: (value) {
                              nameFieldFocused.value = true;
                            },
                            autovalidateMode: nameFieldFocused.value
                                ? AutovalidateMode.onUserInteraction
                                : AutovalidateMode.disabled,
                            textInputAction: TextInputAction.done,
                            keyboardType: TextInputType.text,
                            style: theme.textTheme.bodyLarge?.copyWith(
                                fontWeight: FontWeight.w500,
                                color: themeController.isDarkMode
                                    ? colorWhite
                                    : colorGrey900),
                          ),
                        ),
                        const SizedBox(height: 20),
                        Text(
                          lang.translate('selectColor'),
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: themeController.isDarkMode
                                ? colorGrey600
                                : colorGrey300,
                            fontWeight: FontWeight.w400,
                          ),
                        ),
                        const SizedBox(height: 10),
                        InkWell(
                          onTap: () async {
                            Color? color = await ColorPickerDialog.show(
                                context, selectedColor, theme);

                            if (color != null) {
                              setState(() {
                                selectedColor = color;
                              });
                            }
                          },
                          child: Container(
                            width: double.infinity,
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                color: themeController.isDarkMode
                                    ? colorGrey700
                                    : colorGrey100,
                              ),
                            ),
                            padding: EdgeInsets.all(10),
                            child: Container(
                              width: double.infinity,
                              height: 18,
                              color: selectedColor,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),

              // Action Buttons
              Padding(
                padding: EdgeInsets.all(isMobile ? 10 : 20),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Expanded(
                      child: CommonButton(
                        height: 40,
                        borderRadius: 8,
                        borderColor: themeController.isDarkMode
                            ? colorGrey700
                            : colorGrey100,
                        bgColor: Colors.transparent,
                        onPressed: () => Navigator.pop(context),
                        textStyle: theme.textTheme.bodyMedium?.copyWith(
                            fontWeight: FontWeight.w500,
                            color: themeController.isDarkMode
                                ? colorWhite
                                : colorGrey900),
                        text: lang.translate('cancel'),
                      ),
                    ),
                    SizedBox(width: isMobile ? 16 : 24),
                    Expanded(
                      child: CommonButton(
                        height: 40,
                        borderRadius: 8,
                        textStyle: theme.textTheme.bodyMedium?.copyWith(
                            fontWeight: FontWeight.w500, color: Colors.white),
                        onPressed: () {
                          if (_formKey.currentState?.validate() == true) {
                            final result = AppFlowyGroupData<Color>(
                              id: generateRandomId(),
                              name: boardNameController.text,
                              customData: selectedColor,
                              items: [],
                            );

                            Navigator.pop(context, result);
                          }
                        },
                        text: lang.translate('save'),
                      ),
                    ),
                  ],
                ),
              )
            ],
          ),
        ),
      ),
    );
  }
}
