import 'package:dash_master_toolkit/forms/form_imports.dart';
import 'package:responsive_framework/responsive_framework.dart' as rf;

class ValidationFormScreen extends StatefulWidget {
  const ValidationFormScreen({super.key});

  @override
  State<ValidationFormScreen> createState() => _ValidationFormScreenState();
}

class _ValidationFormScreenState extends State<ValidationFormScreen> {
  final ValidationFormFieldsController controller =
      Get.put(ValidationFormFieldsController());
  ThemeController themeController = Get.put(ThemeController());

  @override
  Widget build(BuildContext context) {
    AppLocalizations lang = AppLocalizations.of(context);
    double screenWidth = MediaQuery.of(context).size.width;

    ThemeData theme = Theme.of(context);
    final isMobile = responsiveValue<bool>(
      context,
      xs: true,
      sm: true,
      md: false,
      lg: false,
      xl: false,
    );

    var titleTextStyle = theme.textTheme.bodyMedium?.copyWith(
      fontWeight: FontWeight.w500,
    );

    return Scaffold(
      backgroundColor: themeController.isDarkMode ? colorGrey900 : colorWhite,
      body: SingleChildScrollView(
        padding: EdgeInsets.all(
          rf.ResponsiveValue<double>(
            context,
            conditionalValues: [
              const rf.Condition.between(start: 0, end: 340, value: 10),
              const rf.Condition.between(start: 341, end: 992, value: 16),
            ],
            defaultValue: 24,
          ).value,
        ),
        child: SingleChildScrollView(
          child: Form(
            key: controller.formKey,
            child: _commonBackgroundWidget(
              screenWidth: screenWidth,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _commonTitleTextWidget(
                    theme: theme,
                    title: lang.translate('firstName'),
                  ),
                  _buildTextField(
                      label: lang.translate('enterFirstName'),
                      controller: controller.firstName,
                      onChanged: (String value) {},
                      validator: (value) {
                        return validateText(
                          value,
                          lang.translate('firstNameRequired'),
                        );
                      },
                      focusNode: controller.f1),
                  _commonTitleTextWidget(
                    theme: theme,
                    title: lang.translate('lastName'),
                  ),
                  _buildTextField(
                      label: lang.translate('enterLastName'),
                      focusNode: controller.f2,
                      validator: (value) {
                        return validateText(
                          value,
                          lang.translate('lastNameRequired'),
                        );
                      },
                      controller: controller.lastName),
                  _commonTitleTextWidget(
                    theme: theme,
                    title: lang.translate('email'),
                  ),
                  _buildTextField(
                      label: lang.translate('enterEmail'),
                      focusNode: controller.f3,
                      validator: (value) {
                        return validateEmail(
                          value,
                          context,
                        );
                      },
                      controller: controller.email,
                      keyboardType: TextInputType.emailAddress),
                  _commonTitleTextWidget(
                    theme: theme,
                    title: lang.translate('password'),
                  ),
                  _buildTextField(
                      label: lang.translate('enterPassword'),
                      focusNode: controller.f4,
                      controller: controller.password,
                      validator: (value) {
                        return validatePassword(
                          value,
                        );
                      },
                      obscureText: true),
                  _commonTitleTextWidget(
                    theme: theme,
                    title: lang.translate('phoneNumber1'),
                  ),
                  _buildTextField(
                      label: lang.translate('enterPhoneNumber'),
                      focusNode: controller.f5,
                      controller: controller.phone,
                      textInputAction: TextInputAction.done,
                      validator: (value) {
                        return validatePhoneNumber(
                          value!,
                          context,
                        );
                      },
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                      keyboardType: TextInputType.phone),
                  ResponsiveGridRow(
                    children: [
                      ResponsiveGridCol(
                        lg: 4,
                        xl: 4,
                        md: 4,
                        sm: 12,
                        xs: 12,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _commonTitleTextWidget(
                              theme: theme,
                              title: lang.translate('selectCountry'),
                            ),
                            _buildCountryDropdown(theme, lang),
                          ],
                        ),
                      ),
                      ResponsiveGridCol(
                        lg: 4,
                        xl: 4,
                        md: 4,
                        sm: 12,
                        xs: 12,
                        child: Padding(
                          padding: EdgeInsetsDirectional.only(
                              start: isMobile ? 0 : 10.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              _commonTitleTextWidget(
                                theme: theme,
                                title: lang.translate('selectState'),
                              ),
                              _buildStateDropdown(theme, lang),
                            ],
                          ),
                        ),
                      ),
                      ResponsiveGridCol(
                        lg: 4,
                        xl: 4,
                        md: 4,
                        sm: 12,
                        xs: 12,
                        child: Padding(
                          padding: EdgeInsetsDirectional.only(
                              start: isMobile ? 0 : 10.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              _commonTitleTextWidget(
                                theme: theme,
                                title: lang.translate('selectCity'),
                              ),
                              _buildCityDropdown(theme, lang),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Obx(
                        () => SizedBox(
                          width: 24,
                          height: 24,
                          child: Theme(
                            data: Theme.of(context).copyWith(
                              checkboxTheme: CheckboxThemeData(
                                side: BorderSide(
                                  color: colorGrey500,
                                  width: 2.0,
                                ),
                              ),
                            ),
                            child: Checkbox(
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(5),
                                side: BorderSide(color: colorGrey500),
                              ),
                              activeColor: colorPrimary100,
                              value: controller.acceptTerms.value,
                              onChanged: (val) =>
                                  controller.acceptTerms.value = val!,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            lang.translate('acceptTermsAndConditions'),
                            style: titleTextStyle?.copyWith(fontSize: 16),
                          ),
                          Obx(
                            () {
                              if (controller.submitClick.value) {
                                return (controller.acceptTerms.value == false)
                                    ? Text(
                                        lang.translate(
                                            'pleaseCheckThisBoxToContinue'),
                                        style:
                                            theme.textTheme.bodySmall?.copyWith(
                                          color: Colors.red,
                                          fontWeight: FontWeight.w400,
                                        ),
                                      )
                                    : Wrap();
                              }
                              return Wrap();
                            },
                          ),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),
                  CommonButton(
                    borderRadius: 8,
                    width: 150,
                    onPressed: () {
                      controller.submitClick.value = true;
                      if (!controller.formKey.currentState!.validate()) {}
                    },
                    text: lang.translate('submit'),
                  )
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  _commonTitleTextWidget({
    required ThemeData theme,
    required String title,
  }) {
    return Text(
      title,
      style: theme.textTheme.bodyMedium?.copyWith(
        fontWeight: FontWeight.w600,
      ),
    );
  }

  Widget _buildCountryDropdown(ThemeData theme, AppLocalizations lang) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16, top: 5),
      child: Obx(() => DropdownButtonFormField<String>(
            value: controller.selectedCountry.value.isEmpty
                ? null
                : controller.selectedCountry.value,
            autovalidateMode: AutovalidateMode.onUserInteraction,
            validator: (value) {
              return validateText(
                value,
                lang.translate('countryIsRequired'),
              );
            },
            decoration: inputDecoration(
              context,
              hintText: AppLocalizations.of(context).translate("country"),
            ),
            items: controller.countryStateCityMap.keys
                .map(
                  (country) => DropdownMenuItem(
                    value: country,
                    child: Text(
                      country,
                      style: theme.textTheme.bodyMedium
                          ?.copyWith(fontWeight: FontWeight.w500),
                    ),
                  ),
                )
                .toList(),
            onChanged: (value) {
              controller.selectedCountry.value = value!;
              controller.selectedState.value = '';
              controller.selectedCity.value = '';
            },
          )),
    );
  }

  Widget _buildStateDropdown(
    ThemeData theme,
    AppLocalizations lang,
  ) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16, top: 5),
      child: Obx(() {
        final selectedCountry = controller.selectedCountry.value;
        final states =
            controller.countryStateCityMap[selectedCountry]?.keys.toList() ??
                [];

        return DropdownButtonFormField<String>(
          value: controller.selectedState.value.isEmpty
              ? null
              : controller.selectedState.value,
          decoration: inputDecoration(
            context,
            hintText: AppLocalizations.of(context).translate("state"),
          ),
          autovalidateMode: AutovalidateMode.onUserInteraction,
          validator: (value) {
            return validateText(
              value,
              lang.translate('stateIsRequired'),
            );
          },
          items: states
              .map(
                (state) => DropdownMenuItem(
                  value: state,
                  child: Text(
                    state,
                    style: theme.textTheme.bodyMedium
                        ?.copyWith(fontWeight: FontWeight.w500),
                  ),
                ),
              )
              .toList(),
          onChanged: (value) {
            controller.selectedState.value = value!;
            controller.selectedCity.value = '';
          },
        );
      }),
    );
  }

  Widget _buildCityDropdown(ThemeData theme, AppLocalizations lang) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16, top: 5),
      child: Obx(() {
        final selectedCountry = controller.selectedCountry.value;
        final selectedState = controller.selectedState.value;
        final cities = controller.countryStateCityMap[selectedCountry]
                ?[selectedState] ??
            [];

        return DropdownButtonFormField<String>(
          value: controller.selectedCity.value.isEmpty
              ? null
              : controller.selectedCity.value,
          decoration: inputDecoration(
            context,
            hintText: AppLocalizations.of(context).translate("city"),
          ),
          autovalidateMode: AutovalidateMode.onUserInteraction,
          validator: (value) {
            return validateText(
              value,
              lang.translate('cityIsRequired'),
            );
          },
          items: cities
              .map(
                (city) => DropdownMenuItem(
                  value: city,
                  child: Text(
                    city,
                    style: theme.textTheme.bodyMedium
                        ?.copyWith(fontWeight: FontWeight.w500),
                  ),
                ),
              )
              .toList(),
          onChanged: (value) => controller.selectedCity.value = value!,
        );
      }),
    );
  }

  Widget _buildTextField({
    required String label,
    required TextEditingController controller,
    ValueChanged<String>? onChanged,
    String? Function(String?)? validator,
    required FocusNode focusNode,
    ValueChanged<String>? onSubmitted,
    TextInputType? keyboardType,
    List<TextInputFormatter>? inputFormatters,
    TextInputAction? textInputAction,
    bool obscureText = false,
    int maxLines = 1,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16, top: 5),
      child: Obx(
        () => TextFormField(
          inputFormatters: inputFormatters ?? [],
          controller: controller,
          onChanged: onChanged,
          keyboardType: keyboardType,
          obscureText: obscureText,
          textInputAction: textInputAction ?? TextInputAction.next,
          maxLines: maxLines,
          autovalidateMode: AutovalidateMode.onUserInteraction,
          validator: validator,
          onFieldSubmitted: (value) {
            focusNode.unfocus();
            if (onSubmitted != null) {
              onSubmitted(value);
            }
          },
          decoration: inputDecoration(
            context,
            hintText: label,
          ),
        ),
      ),
    );
  }

  _commonBackgroundWidget(
      {required Widget child, required double? screenWidth}) {
    return Container(
      width: screenWidth,
      padding: EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: themeController.isDarkMode ? colorDark : colorWhite,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [BoxShadow(blurRadius: 6, color: Colors.black12)],
      ),
      child: child,
    );
  }
}
