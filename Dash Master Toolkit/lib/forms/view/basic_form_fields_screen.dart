
import 'package:dash_master_toolkit/forms/form_imports.dart';
import 'package:responsive_framework/responsive_framework.dart' as rf;

class BasicFormFieldsScreen extends StatefulWidget {
  const BasicFormFieldsScreen({super.key});

  @override
  State<BasicFormFieldsScreen> createState() => _BasicFormFieldsScreenState();
}

class _BasicFormFieldsScreenState extends State<BasicFormFieldsScreen> {
  final BasicFormFieldsController controller =
      Get.put(BasicFormFieldsController());
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
        child: Form(
          key: controller.formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // basic inputs
              _commonBackgroundWidget(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SizedBox(
                        height: 10,
                      ),
                      _commonTitleTextWidget(
                          theme: theme,
                          title: lang.translate("basicInputFields"),
                          isMobile: isMobile),
                      SizedBox(
                        height: 10,
                      ),
                      _commonDividerWidget(),
                      SizedBox(
                        height: 15,
                      ),
                      ResponsiveGridRow(
                        children: [
                          ResponsiveGridCol(
                            xs: 12,
                            sm: 12,
                            md: 6,
                            lg: 4,
                            xl: 4,
                            child: Padding(
                              padding: EdgeInsetsDirectional.only(
                                  end: isMobile ? 10 : 0),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  // Name Text Field
                                  TextFormField(
                                    style: titleTextStyle,
                                    controller: controller.nameController,
                                    textInputAction: TextInputAction.next,
                                    keyboardType: TextInputType.text,
                                    decoration: inputDecoration(
                                      context,
                                      hintText: lang.translate('nameCityTag'),
                                    ),
                                  ),
                                  SizedBox(
                                    height: 20,
                                  ),
                                  // Email Text Field
                                  TextFormField(
                                    style: titleTextStyle,
                                    controller: controller.emailController,
                                    textInputAction: TextInputAction.next,
                                    keyboardType: TextInputType.emailAddress,
                                    decoration: inputDecoration(
                                      context,
                                      hintText: lang.translate('email'),
                                    ),
                                  ),
                                  SizedBox(
                                    height: 20,
                                  ),
                                  // Password Text Field
                                  Obx(
                                    () => TextFormField(
                                      style: titleTextStyle,
                                      controller: controller.passwordController,
                                      textInputAction: TextInputAction.next,
                                      keyboardType: TextInputType.text,
                                      obscureText:
                                          controller.isPasswordHidden.value,
                                      decoration: inputDecoration(
                                        context,
                                        onSuffixPressed: () {
                                          controller.togglePasswordVisibility();
                                        },
                                        suffixIconColor: colorGrey500,
                                        suffixIcon:
                                            (controller.isPasswordHidden.value)
                                                ? eyeOffIcon
                                                : eyeIcon,
                                        hintText: lang.translate('password'),
                                      ),
                                    ),
                                  ),
                                  SizedBox(
                                    height: 30,
                                  ),
                                  // Slider Input
                                  Obx(() => Row(
                                        children: [
                                          Text(
                                              '${lang.translate("sliderValue")} ${controller.sliderValue.value.toStringAsFixed(0)}'),
                                          Expanded(
                                            child: Slider(
                                              value:
                                                  controller.sliderValue.value,
                                              min: 0,
                                              max: 100,
                                              divisions: 100,
                                              activeColor: colorPrimary100,
                                              inactiveColor:
                                                  themeController.isDarkMode
                                                      ? colorGrey700
                                                      : colorGrey100,
                                              label: controller
                                                  .sliderValue.value
                                                  .toStringAsFixed(0),
                                              onChanged: (val) => controller
                                                  .sliderValue.value = val,
                                            ),
                                          ),
                                        ],
                                      )),
                                ],
                              ),
                            ),
                          ),
                          ResponsiveGridCol(
                            xs: 12,
                            sm: 12,
                            md: 6,
                            lg: 4,
                            xl: 4,
                            child: Padding(
                              padding: EdgeInsetsDirectional.only(
                                  start: !isMobile ? 10 : 0),
                              child: Column(
                                children: [
                                  // Search Field
                                  TextFormField(
                                    style: titleTextStyle,
                                    controller: controller.searchController,
                                    textInputAction: TextInputAction.search,
                                    keyboardType: TextInputType.text,
                                    decoration: inputDecoration(
                                      context,
                                      suffixWidget: IconButton(
                                        icon: Icon(
                                          Icons.search,
                                          color: colorGrey500,
                                        ),
                                        onPressed: () {},
                                      ),
                                      hintText: lang.translate('search'),
                                    ),
                                  ),
                                  SizedBox(
                                    height: 20,
                                  ),
                                  // URL Text Field
                                  TextFormField(
                                    style: titleTextStyle,
                                    textInputAction: TextInputAction.next,
                                    controller: controller.urlController,
                                    keyboardType: TextInputType.url,
                                    decoration: inputDecoration(
                                      context,
                                      hintText: lang.translate('URL'),
                                    ),
                                  ),
                                  SizedBox(
                                    height: 20,
                                  ),
                                  // Currency Text Field
                                  TextFormField(
                                    style: titleTextStyle,
                                    controller: controller.currencyController,
                                    textInputAction: TextInputAction.newline,
                                    keyboardType:
                                        TextInputType.numberWithOptions(
                                            decimal: true),
                                    inputFormatters: [
                                      FilteringTextInputFormatter.allow(
                                          RegExp(r'^\d+\.?\d{0,2}')),
                                    ],
                                    decoration: inputDecoration(
                                      context,
                                      suffixWidget: IconButton(
                                        icon: Icon(
                                          Icons.currency_rupee,
                                          color: colorGrey500,
                                        ),
                                        onPressed: () {},
                                      ),
                                      hintText: lang.translate('currency'),
                                    ),
                                  ),
                                  SizedBox(
                                    height: 20,
                                  ),
                                  // Date Text Field
                                  GestureDetector(
                                    onTap: () => controller.pickDate(context),
                                    child: AbsorbPointer(
                                      child: TextFormField(
                                        readOnly: true,
                                        style: titleTextStyle,
                                        controller: controller.dateController,
                                        textInputAction: TextInputAction.done,
                                        decoration: inputDecoration(
                                          context,
                                          suffixWidget: IconButton(
                                            icon: Icon(
                                              Icons.calendar_today,
                                              color: colorGrey500,
                                            ),
                                            onPressed: () {},
                                          ),
                                          hintText: lang.translate('dateInput'),
                                        ),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                          ResponsiveGridCol(
                            xs: 12,
                            sm: 12,
                            md: 6,
                            lg: 4,
                            xl: 4,
                            child: Padding(
                              padding: EdgeInsetsDirectional.only(
                                  start: !isMobile ? 10 : 0),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  // Phone Number Text Field
                                  TextFormField(
                                    style: titleTextStyle,
                                    controller: controller.phoneController,
                                    textInputAction: TextInputAction.next,
                                    keyboardType: TextInputType.phone,
                                    inputFormatters: [
                                      FilteringTextInputFormatter.digitsOnly
                                    ],
                                    decoration: inputDecoration(
                                      context,
                                      hintText: lang.translate('phoneNumber1'),
                                    ),
                                  ),
                                  SizedBox(
                                    height: 20,
                                  ),
                                  // Quantity Text Field
                                  TextFormField(
                                    style: titleTextStyle,
                                    textInputAction: TextInputAction.next,
                                    controller: controller.numberController,
                                    keyboardType: TextInputType.number,
                                    inputFormatters: [
                                      FilteringTextInputFormatter.allow(
                                          RegExp(r'[0-9.]'))
                                    ],
                                    decoration: inputDecoration(
                                      context,
                                      hintText: lang.translate('quantityPrice'),
                                    ),
                                  ),
                                  SizedBox(
                                    height: 20,
                                  ),
                                  // Description Text Field
                                  TextFormField(
                                    style: titleTextStyle,
                                    controller: controller.notesController,
                                    textInputAction: TextInputAction.newline,
                                    keyboardType: TextInputType.multiline,
                                    maxLines: 4,
                                    decoration: inputDecoration(
                                      context,
                                      hintText:
                                          lang.translate('descriptionNotes'),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                      SizedBox(
                        height: 10,
                      ),
                    ],
                  ),
                  screenWidth: screenWidth),

              SizedBox(
                height: 30,
              ),

              // Style inputs
              _commonBackgroundWidget(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SizedBox(
                        height: 10,
                      ),
                      _commonTitleTextWidget(
                          theme: theme,
                          title: lang.translate("uiStyleInputFields"),
                          isMobile: isMobile),
                      SizedBox(
                        height: 10,
                      ),
                      _commonDividerWidget(),
                      SizedBox(
                        height: 15,
                      ),
                      ResponsiveGridRow(
                        children: [
                          ResponsiveGridCol(
                            xs: 12,
                            sm: 12,
                            md: 6,
                            lg: 4,
                            xl: 4,
                            child: Padding(
                              padding: EdgeInsetsDirectional.only(
                                  end: isMobile ? 10 : 0),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  // Outlined Text Field
                                  TextFormField(
                                    style: titleTextStyle,
                                    // controller: controller.nameController,
                                    textInputAction: TextInputAction.next,
                                    keyboardType: TextInputType.text,
                                    decoration: inputDecoration(
                                      context,
                                      labelText:
                                          lang.translate('outlinedTextField'),
                                      hintText: lang.translate('fullName'),
                                    ),
                                  ),
                                  SizedBox(
                                    height: 20,
                                  ),
                                  // Filled Text Field
                                  TextFormField(
                                    style: titleTextStyle,
                                    // controller: controller.emailController,
                                    textInputAction: TextInputAction.next,
                                    keyboardType: TextInputType.text,
                                    decoration: inputDecoration(
                                      context,
                                      fillColor: themeController.isDarkMode
                                          ? colorGrey700
                                          : colorGrey100,
                                      borderColor: Colors.transparent,
                                      hintText:
                                          lang.translate('filledTextField'),
                                    ),
                                  ),
                                  SizedBox(
                                    height: 20,
                                  ),
                                  // Underline Text Field
                                  TextFormField(
                                      style: titleTextStyle,
                                      // controller: controller.emailController,
                                      textInputAction: TextInputAction.next,
                                      keyboardType: TextInputType.text,
                                      decoration: InputDecoration(
                                          labelText: lang
                                              .translate('underlineTextField'),
                                          hintText:
                                              lang.translate('usernameEmail'),
                                          border: UnderlineInputBorder(
                                              borderSide: BorderSide(
                                                  color:
                                                      themeController.isDarkMode
                                                          ? colorGrey700
                                                          : colorGrey100)),
                                          focusedBorder: UnderlineInputBorder(
                                              borderSide: BorderSide(
                                                  color: colorPrimary100)))),
                                ],
                              ),
                            ),
                          ),
                          ResponsiveGridCol(
                            xs: 12,
                            sm: 12,
                            md: 6,
                            lg: 4,
                            xl: 4,
                            child: Padding(
                              padding: EdgeInsetsDirectional.only(
                                  start: !isMobile ? 10 : 0),
                              child: Column(
                                children: [
                                  // Prefix and suffix Field
                                  TextFormField(
                                    style: titleTextStyle,
                                    // controller: controller.searchController,
                                    textInputAction: TextInputAction.done,
                                    keyboardType: TextInputType.emailAddress,
                                    decoration: inputDecoration(
                                      context,
                                      suffixWidget: IconButton(
                                        icon: Icon(
                                          Icons.check_circle,
                                          color: colorSuccess300,
                                        ),
                                        onPressed: () {},
                                      ),
                                      prefixWidget: Padding(
                                        padding: const EdgeInsets.only(
                                            left: 8.0, right: 8.0),
                                        child: Icon(
                                          Icons.email_outlined,
                                          color: colorGrey500,
                                        ),
                                      ),
                                      labelText:
                                          lang.translate('prefixSuffixIcon'),
                                      hintText: lang.translate('email'),
                                    ),
                                  ),
                                  SizedBox(
                                    height: 20,
                                  ),
                                  // Error Text Field
                                  Obx(
                                    () => TextFormField(
                                      style: titleTextStyle,
                                      autovalidateMode: controller
                                              .phoneFieldFocused.value
                                          ? AutovalidateMode.onUserInteraction
                                          : AutovalidateMode.disabled,
                                      validator: (value) =>
                                          validatePhoneNumber(value!, context),
                                      onChanged: (value) {
                                        controller.phoneFieldFocused.value =
                                            true;
                                      },
                                      textInputAction: TextInputAction.next,
                                      controller:
                                          controller.phoneTextController,
                                      keyboardType: TextInputType.phone,
                                      inputFormatters: [
                                        FilteringTextInputFormatter.digitsOnly
                                      ],
                                      decoration: inputDecoration(
                                        context,
                                        errorText: lang
                                            .translate("phoneNumberIsRequired"),
                                        labelText: lang.translate('errorState'),
                                        hintText: lang.translate('phoneNumber'),
                                      ),
                                    ),
                                  ),
                                  SizedBox(
                                    height: 20,
                                  ),
                                  // Success Text Field
                                  Obx(() {
                                    final state =
                                        controller.fieldStates['email'] ??
                                            FieldState.none;
                                    return TextFormField(
                                      style: titleTextStyle,
                                      autovalidateMode: controller
                                              .emailFieldFocused.value
                                          ? AutovalidateMode.onUserInteraction
                                          : AutovalidateMode.disabled,
                                      validator: (value) => controller
                                          .validateEmailText(value, lang),
                                      onChanged: (value) {
                                        controller.emailFieldFocused.value =
                                            true;
                                      },
                                      textInputAction: TextInputAction.next,
                                      controller:
                                          controller.emailTextController,
                                      keyboardType: TextInputType.emailAddress,
                                      decoration: inputDecoration(
                                        context,
                                        borderColor: _getBorderColor(state),
                                        errorColor: _getBorderColor(state),
                                        errorText: controller
                                            .validateEmailText(controller.emailTextController.text, lang),/*(state == FieldState.warning || state == FieldState.error)
                                            ? validation.message
                                            : null*/
                                        labelText:
                                            lang.translate('successState'),
                                        hintText: lang.translate('email'),
                                      ),
                                    );
                                  }),
                                ],
                              ),
                            ),
                          ),
                          ResponsiveGridCol(
                            xs: 12,
                            sm: 12,
                            md: 6,
                            lg: 4,
                            xl: 4,
                            child: Padding(
                              padding: EdgeInsetsDirectional.only(
                                  start: !isMobile ? 10 : 0),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  // Disable Text Field
                                  TextFormField(
                                    enabled: false,
                                    style: titleTextStyle,
                                    controller: controller.statusController,
                                    textInputAction: TextInputAction.next,
                                    keyboardType: TextInputType.phone,
                                    inputFormatters: [
                                      FilteringTextInputFormatter.digitsOnly
                                    ],
                                    decoration: inputDecoration(
                                      context,
                                      hintText: lang.translate('status'),
                                      labelText: lang.translate('disableTextField'),
                                    ),
                                  ),
                                  SizedBox(
                                    height: 20,
                                  ),
                                  // Counter Text Field
                                  TextFormField(
                                    maxLength: 50,
                                    buildCounter: (
                                        BuildContext context, {
                                          required int currentLength,
                                          required bool isFocused,
                                          required int? maxLength,
                                        }) {
                                      final remaining = (maxLength ?? 0) - currentLength;
                                      return Text(
                                        '$remaining characters remaining',
                                        style: theme.textTheme.bodySmall?.copyWith(
                                          color: remaining < 10 ? Colors.orange : colorGrey500,
                                        ),
                                      );
                                    },
                                    decoration: inputDecoration(
                                      context,
                                      labelText:lang.translate('description'),
                                      hintText: lang.translate('enterCharacters'),
                                      // counterText: '', // hide counter if needed
                                    ),
                                  ),
                                  SizedBox(
                                    height: 20,
                                  ),
                                  // File Text Field
                                  Obx(()=> TextFormField(
                                      style: titleTextStyle,
                                    
                                      textInputAction: TextInputAction.done,
                                      keyboardType: TextInputType.text,
                                      readOnly: true,
                                      controller: TextEditingController(text: controller.pickedFileName.value)
                                        ..selection = TextSelection.collapsed(offset: controller.pickedFileName.value.length),
                                      onTap: controller.pickFile,
                                      decoration: inputDecoration(
                                        context,
                                        suffixWidget: controller.pickedFileName.value.isNotEmpty
                                            ? IconButton(
                                          icon: const Icon(Icons.clear),
                                          onPressed: controller.clearFile,
                                        )
                                            : IconButton(
                                          icon: const Icon(Icons.attach_file),
                                          onPressed: controller.pickFile,
                                        ),
                                        labelText: lang.translate('uploadFile'),
                                        hintText:
                                            lang.translate('uploadFile'),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                      SizedBox(
                        height: 10,
                      ),
                    ],
                  ),
                  screenWidth: screenWidth),
            ],
          ),
        ),
      ),
    );
  }

  Color _getBorderColor(FieldState state) {
    switch (state) {
      case FieldState.valid:
        return Colors.green;
      case FieldState.warning:
        return Colors.orange;
      case FieldState.error:
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  _commonDividerWidget() {
    return Divider(
      color: themeController.isDarkMode ? colorGrey700 : colorGrey100,
    );
  }

  _commonTitleTextWidget({
    required ThemeData theme,
    required String title,
    required bool isMobile,
  }) {
    return Text(
      title,
      style: theme.textTheme.titleLarge
          ?.copyWith(fontWeight: FontWeight.w600, fontSize: isMobile ? 18 : 20),
    );
  }

  _commonBackgroundWidget(
      {required Widget child, required double? screenWidth}) {
    return Container(
      width: screenWidth,
      padding: EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: themeController.isDarkMode ? colorDark : colorWhite,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [BoxShadow(blurRadius: 6, color: Colors.black12)],
      ),
      child: child,
    );
  }
}
