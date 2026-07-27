import 'package:flutter/cupertino.dart';
import 'package:dash_master_toolkit/core/config/api_config.dart';
import 'package:dash_master_toolkit/forms/form_imports.dart';
import 'package:responsive_framework/responsive_framework.dart' as rf;
import 'package:http/http.dart' as http;
import 'dart:convert';
class CustomFormScreen extends StatefulWidget {
  const CustomFormScreen({super.key});

  @override
  State<CustomFormScreen> createState() => _CustomFormScreenState();
}

class _CustomFormScreenState extends State<CustomFormScreen> {
  final CustomFormController controller = Get.put(CustomFormController());
  List<Map<String, dynamic>> _geoOptions = [];
  TextEditingController _addressController = TextEditingController();
  ThemeController themeController = Get.put(ThemeController());
   Future<void> _fetchGeoSuggestions(String query) async {
  if (query.length < 3) return;

  try {
    final uri = Uri.parse("${ApiConfig.baseUrl}/utils/geocode")
        .replace(queryParameters: {"q": query});

    final res = await http.get(uri);

    if (res.statusCode == 200) {
      final List data = jsonDecode(res.body);

      setState(() {
        _geoOptions = data.cast<Map<String, dynamic>>();
      });
    }
  } catch (e) {
    print("Geo error: $e");
  }
}
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
                  Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _commonTitleTextWidget(
                              theme: theme,
                              title: lang.translate('firstName'),
                            ),
                            _buildTextField(
                                label: lang.translate('enterFirstName'),
                                onChanged: controller.firstName),
                          ],
                        ),
                      ),
                      SizedBox(
                        width: 10,
                      ),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _commonTitleTextWidget(
                              theme: theme,
                              title: lang.translate('lastName'),
                            ),
                            _buildTextField(
                                label: lang.translate('enterLastName'),
                                onChanged: controller.lastName),
                          ],
                        ),
                      ),
                    ],
                  ),
                  Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _commonTitleTextWidget(
                              theme: theme,
                              title: lang.translate('email'),
                            ),
                            _buildTextField(
                                label: lang.translate('enterEmail'),
                                onChanged: controller.email,
                                keyboardType: TextInputType.emailAddress),
                          ],
                        ),
                      ),
                      SizedBox(
                        width: 10,
                      ),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _commonTitleTextWidget(
                              theme: theme,
                              title: lang.translate('password'),
                            ),
                            _buildTextField(
                                label: lang.translate('enterPassword'),
                                onChanged: controller.password,
                                obscureText: true),
                          ],
                        ),
                      ),
                    ],
                  ),
                  Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _commonTitleTextWidget(
                              theme: theme,
                              title: lang.translate('birthDay'),
                            ),
                            _buildMaskedInputField(),
                          ],
                        ),
                      ),
                      SizedBox(
                        width: 10,
                      ),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _commonTitleTextWidget(
                              theme: theme,
                              title: lang.translate('phoneNumber1'),
                            ),
                            _buildTextField(
                                label: lang.translate('enterPhoneNumber'),
                                onChanged: controller.phone,
                                inputFormatters: [
                                  FilteringTextInputFormatter.digitsOnly
                                ],
                                keyboardType: TextInputType.phone),
                          ],
                        ),
                      ),
                    ],
                  ),
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
                            _buildCountryDropdown(theme),
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
                          padding:  EdgeInsetsDirectional.only(start: isMobile ? 0 : 10.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              _commonTitleTextWidget(
                                theme: theme,
                                title: lang.translate('selectState'),
                              ),
                              _buildStateDropdown(theme),
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
                          padding:  EdgeInsetsDirectional.only(start: isMobile ? 0 : 10.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              _commonTitleTextWidget(
                                theme: theme,
                                title: lang.translate('selectCity'),
                              ),
                              _buildCityDropdown(theme),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),

                  _commonTitleTextWidget(
                    theme: theme,
                    title: lang.translate('age'),
                  ),
                  _buildTextField(
                      label: lang.translate('enterAge'),
                      inputFormatters: [
                        FilteringTextInputFormatter.digitsOnly,
                        LengthLimitingTextInputFormatter(3),
                      ],
                      onChanged: controller.age,
                      keyboardType: TextInputType.number),
                  _commonTitleTextWidget(
                    theme: theme,
                    title: lang.translate('websiteURL'),
                  ),
                  _buildTextField(
                      label: lang.translate('EnterWebsiteURL'),
                      onChanged: controller.url,
                      keyboardType: TextInputType.url),
                  _commonTitleTextWidget(
                    theme: theme,
                    title: lang.translate('monthlyIncome'),
                  ),
                  _buildTextField(
                      label: lang.translate('enterMonthlyIncome'),
                      onChanged: controller.income,
                      inputFormatters: [
                        FilteringTextInputFormatter.digitsOnly,
                        LengthLimitingTextInputFormatter(10),
                      ],
                      keyboardType: TextInputType.number),
                  _commonTitleTextWidget(
                    theme: theme,
                    title: lang.translate('bio'),
                  ),
                  _buildTextField(
                      label: lang.translate('enterBio'),
                      onChanged: controller.bio,
                      maxLines: 3),
                  _commonTitleTextWidget(
                    theme: theme,
                    title: lang.translate('Gender'),
                  ),
                  Obx(() => Row(
                        children: [
                          Radio<String>(
                            value: 'Male',
                            activeColor: colorPrimary100,
                            groupValue: controller.gender.value,
                            onChanged: (val) =>
                                controller.gender.value = val!,
                          ),
                          Text(
                            lang.translate('male'),
                            style: titleTextStyle?.copyWith(fontSize: 14),
                          ),
                          SizedBox(
                            width: 8,
                          ),
                          Radio<String>(
                            value: 'Female',
                            activeColor: colorPrimary100,
                            groupValue: controller.gender.value,
                            onChanged: (val) =>
                                controller.gender.value = val!,
                          ),
                          Text(
                            lang.translate('female'),
                            style: titleTextStyle?.copyWith(fontSize: 14),
                          ),
                        ],
                      )),
                  const SizedBox(height: 16),
                  _commonTitleTextWidget(
                    theme: theme,
                    title: lang.translate('skillsSuggestions'),
                  ),
                  const SizedBox(height: 16),
                Autocomplete<Map<String, dynamic>>(
  optionsBuilder: (TextEditingValue textEditingValue) {
    return _geoOptions.where((option) =>
        option["displayName"]
            .toLowerCase()
            .contains(textEditingValue.text.toLowerCase()));
  },

  displayStringForOption: (option) => option["displayName"],

  onSelected: (option) {
    final lat = option["lat"];
    final lng = option["lon"];

    _addressController.text = option["displayName"];

    // 👉 ici tu peux stocker lat/lng si besoin
    print("LAT: $lat, LNG: $lng");
  },

  fieldViewBuilder: (context, textController, focusNode, onFieldSubmitted) {
    _addressController = textController;

    return TextFormField(
      controller: textController,
      focusNode: focusNode,
      onChanged: (value) {
        _fetchGeoSuggestions(value);
      },
      decoration: inputDecoration(
        context,
        hintText: "Ex: Tunis, Ariana...",
      ),
    );
  },
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
                      Text(
                        lang.translate('acceptTermsAndConditions'),
                        style: titleTextStyle?.copyWith(fontSize: 16),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        lang.translate('subscribeNewsletter'),
                        style: titleTextStyle?.copyWith(
                          fontSize: 16,
                        ),
                      ),
                      Obx(
                        () => CupertinoSwitch(
                          activeTrackColor: colorPrimary100,
                          inactiveTrackColor: themeController.isDarkMode
                              ? colorGrey700
                              : colorGrey100,
                          value: controller.isSubscribed.value,
                          onChanged: (val) =>
                              controller.isSubscribed.value = val,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),
                  CommonButton(
                    borderRadius: 8,
                    width: 150,
                    onPressed: () {},
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

  Widget _buildCountryDropdown(ThemeData theme) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16,top: 5),
      child: Obx(() => DropdownButtonFormField<String>(
            value: controller.selectedCountry.value.isEmpty
                ? null
                : controller.selectedCountry.value,
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

  Widget _buildStateDropdown(ThemeData theme) {

    return Padding(
      padding: const EdgeInsets.only(bottom: 16,top: 5),
      child: Obx(() {
        final selectedCountry = controller.selectedCountry.value;
        final states = controller.countryStateCityMap[selectedCountry]?.keys.toList() ?? [];

        return  DropdownButtonFormField<String>(
          value: controller.selectedState.value.isEmpty ? null : controller
              .selectedState.value,
          decoration: inputDecoration(
            context,
            hintText: AppLocalizations.of(context).translate("state"),
          ),

          items: states
              .map(
                (state) =>
                DropdownMenuItem(
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
      } ),
    );
  }

  Widget _buildCityDropdown(ThemeData theme) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16,top: 5),
      child: Obx(() {
        final selectedCountry = controller.selectedCountry.value;
        final selectedState = controller.selectedState.value;
        final cities = controller.countryStateCityMap[selectedCountry]?[selectedState] ?? [];

        return  DropdownButtonFormField<String>(
          value: controller.selectedCity.value.isEmpty ? null : controller
              .selectedCity.value,
          decoration: inputDecoration(
            context,
            hintText: AppLocalizations.of(context).translate("city"),
          ),
          items: cities
              .map(
                (city) =>
                DropdownMenuItem(
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
      } ),
    );
  }

  Widget _buildDatePickerField() {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Obx(() => GestureDetector(
            onTap: () async {
              final pickedDate = await showDatePicker(
                context: context,
                initialDate: DateTime.now(),
                firstDate: DateTime(1900),
                lastDate: DateTime.now(),
              );
              if (pickedDate != null) {
                controller.dob.value =
                    '${pickedDate.day}/${pickedDate.month}/${pickedDate.year}';
              }
            },
            child: AbsorbPointer(
              child: TextField(
                controller: TextEditingController(text: controller.dob.value),
                decoration: inputDecoration(
                  context,
                  labelText: AppLocalizations.of(context).translate('birthDay'),
                ),
              ),
            ),
          )),
    );
  }

  Widget _buildTextField({
    required String label,
    required RxString onChanged,
    TextInputType? keyboardType,
    List<TextInputFormatter>? inputFormatters,
    bool obscureText = false,
    int maxLines = 1,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16, top: 5),
      child: Obx(() => TextFormField(
            inputFormatters: inputFormatters ?? [],
            onChanged: (val) => onChanged.value = val,
            keyboardType: keyboardType,
            obscureText: obscureText,
            maxLines: maxLines,
            decoration: inputDecoration(
              context,
              hintText: label,
            ),
          )),
    );
  }

  Widget _buildMaskedInputField() {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16, top: 5),
      child: Obx(() => TextField(
            onChanged: (val) => controller.maskedInput.value = val,
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp(r'[0-9/]')),
              LengthLimitingTextInputFormatter(10),
              TextInputFormatter.withFunction((oldValue, newValue) {
                if (newValue.text.length == 2 || newValue.text.length == 5) {
                  return TextEditingValue(
                    text: '${newValue.text}/',
                    selection: TextSelection.collapsed(
                        offset: newValue.text.length + 1),
                  );
                }
                return newValue;
              })
            ],
            keyboardType: TextInputType.number,
            decoration: inputDecoration(
              context,
              labelText: 'Masked Date Input (DD/MM/YYYY)',
            ),
          )),
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
