import '../users_imports.dart';

class AddNewUserDialog extends StatefulWidget {
  const AddNewUserDialog({super.key});

  @override
  State<AddNewUserDialog> createState() => _AddNewUserDialogState();
}

class _AddNewUserDialogState extends State<AddNewUserDialog> {
  ThemeController themeController = Get.put(ThemeController());
  TextEditingController userNameController = TextEditingController();
  TextEditingController designationController = TextEditingController();
  TextEditingController departmentController = TextEditingController();
  TextEditingController emailController = TextEditingController();
  TextEditingController phoneNumberController = TextEditingController();
  TextEditingController statusController = TextEditingController();
  FocusNode f1 = FocusNode();
  FocusNode f2 = FocusNode();
  FocusNode f3 = FocusNode();
  FocusNode f4 = FocusNode();

  final userNameFieldFocused = false.obs;
  final designationFieldFocused = false.obs;
  final departmentFieldFocused = false.obs;
  final emailFieldFocused = false.obs;
  final statusFieldFocused = false.obs;
  final phoneNumberFieldFocused = false.obs;
  final formKey = GlobalKey<FormState>();

  var selectedDesignation = ''.obs;
  final List<String> designationOptions = [
    'Front-End Developer',
    'App Developer',
    'Back-End Developer'
  ];
  var selectedDepartment = ''.obs;
  final List<String> departmentOptions = ['Software', 'Creative', 'Mobile'];

  var selectedStatus = ''.obs;
  final List<String> statusOptions = ['Active', 'Inactive'];

  @override
  Widget build(BuildContext context) {
    var lang = AppLocalizations.of(context);
    ThemeData theme = Theme.of(context);
    return Dialog(
      backgroundColor: themeController.isDarkMode ? colorGrey800 : Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
      ),
      child: Container(
        width: MediaQuery.of(context).size.width,
        // 95% of screen width
        constraints: BoxConstraints(maxWidth: 500),
        // Max width for large screens

        child: Form(
          key: formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 20),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20.0),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        lang.translate("addNewUser"),
                        style: theme.textTheme.bodyLarge?.copyWith(
                            fontWeight: FontWeight.w500,
                            color: themeController.isDarkMode
                                ? colorWhite
                                : colorGrey900),
                      ),
                    ),
                    const SizedBox(width: 10),
                    InkWell(
                      onTap: () {
                        context.pop();
                      },
                      child: SvgPicture.asset(
                        cancelIcon,
                        width: 20,
                        height: 20,
                        colorFilter:
                            ColorFilter.mode(colorGrey400, BlendMode.srcIn),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 15),
              Divider(
                height: 1,
                color: themeController.isDarkMode ? colorGrey700 : colorGrey100,
              ),
              const SizedBox(height: 15),
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.symmetric(horizontal: 20.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Center(
                        child: IntrinsicWidth(
                          child: Container(
                            padding: EdgeInsets.symmetric(
                                horizontal: 15, vertical: 20),
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                  color: themeController.isDarkMode
                                      ? colorGrey700
                                      : colorGrey100),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.center,
                              children: [
                                Icon(
                                  Icons.camera_alt_outlined,
                                  color: colorGrey500,
                                ),
                                SizedBox(
                                  height: 10,
                                ),
                                Text(
                                  lang.translate("uploadImage"),
                                  style: theme.textTheme.bodyMedium?.copyWith(
                                      fontWeight: FontWeight.w500,
                                      color: colorGrey500),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 5),
                      Text(
                        lang.translate("name"),
                        style: theme.textTheme.bodyMedium?.copyWith(
                            fontWeight: FontWeight.w500, color: colorGrey500),
                      ),
                      const SizedBox(height: 5),
                      Obx(
                        () => TextFormField(
                          style: theme.textTheme.bodyLarge?.copyWith(
                              fontWeight: FontWeight.w500,
                              color: themeController.isDarkMode
                                  ? colorWhite
                                  : colorGrey900),
                          focusNode: f1,
                          validator: (value) => validateText(
                            value,
                            lang.translate("nameIsRequired"),
                          ),
                          onFieldSubmitted: (v) {
                            f1.unfocus();
                            FocusScope.of(context).requestFocus(f2);
                          },
                          onChanged: (value) {
                            userNameFieldFocused.value = true;
                            designationFieldFocused.value = false;
                            departmentFieldFocused.value = false;
                            emailFieldFocused.value = false;
                            statusFieldFocused.value = false;
                            phoneNumberFieldFocused.value = false;
                          },
                          autovalidateMode: userNameFieldFocused.value
                              ? AutovalidateMode.onUserInteraction
                              : AutovalidateMode.disabled,
                          controller: userNameController,
                          textInputAction: TextInputAction.next,
                          keyboardType: TextInputType.text,
                          decoration: inputDecoration(context,
                              hintText: lang.translate("enterName")),
                        ),
                      ),
                      const SizedBox(height: 15),
                      Text(
                        lang.translate("designation"),
                        style: theme.textTheme.bodyMedium?.copyWith(
                            fontWeight: FontWeight.w500, color: colorGrey500),
                      ),
                      const SizedBox(height: 5),
                      Obx(
                        () => DropdownButtonFormField<String>(
                          decoration: inputDecoration(
                            context,
                          ),
                          hint: Text(
                            lang.translate('selectDesignation'),
                            style: theme.textTheme.bodyLarge?.copyWith(
                              color: (themeController.isDarkMode
                                  ? colorGrey600
                                  : colorGrey300),
                              fontWeight: FontWeight.w400,
                            ),
                          ),
                          icon: SvgPicture.asset(
                            angleDownIcon,
                            colorFilter: ColorFilter.mode(
                                Get.isDarkMode ? Colors.white : colorGrey900,
                                BlendMode.srcIn),
                          ),
                          value: selectedDesignation.value.isEmpty
                              ? null
                              : selectedDesignation.value,
                          onChanged: (newValue) {
                            selectedDesignation.value = newValue ?? '';
                            userNameFieldFocused.value = false;
                            designationFieldFocused.value = true;
                            departmentFieldFocused.value = false;
                            emailFieldFocused.value = false;
                            statusFieldFocused.value = false;
                            phoneNumberFieldFocused.value = false;
                          },
                          validator: (value) => validateText(
                            value,
                            lang.translate('designationIsRequired'),
                          ),
                          autovalidateMode: designationFieldFocused.value
                              ? AutovalidateMode.onUserInteraction
                              : AutovalidateMode.disabled,
                          items: designationOptions.map((des) {
                            return DropdownMenuItem(
                              value: des,
                              child: Text(
                                des,
                                style: theme.textTheme.bodyMedium
                                    ?.copyWith(fontWeight: FontWeight.w500),
                              ),
                            );
                          }).toList(),
                        ),
                      ),
                      const SizedBox(height: 15),
                      Text(
                        lang.translate("department"),
                        style: theme.textTheme.bodyMedium?.copyWith(
                            fontWeight: FontWeight.w500, color: colorGrey500),
                      ),
                      const SizedBox(height: 5),
                      Obx(
                        () => DropdownButtonFormField<String>(
                          decoration: inputDecoration(
                            context,
                          ),
                          hint: Text(
                            lang.translate('selectDepartment'),
                            style: theme.textTheme.bodyLarge?.copyWith(
                              color: (themeController.isDarkMode
                                  ? colorGrey600
                                  : colorGrey300),
                              fontWeight: FontWeight.w400,
                            ),
                          ),
                          icon: SvgPicture.asset(
                            angleDownIcon,
                            colorFilter: ColorFilter.mode(
                                Get.isDarkMode ? Colors.white : colorGrey900,
                                BlendMode.srcIn),
                          ),
                          value: selectedDepartment.value.isEmpty
                              ? null
                              : selectedDepartment.value,
                          onChanged: (newValue) {
                            selectedDepartment.value = newValue ?? '';
                            userNameFieldFocused.value = false;
                            designationFieldFocused.value = false;
                            departmentFieldFocused.value = true;
                            emailFieldFocused.value = false;
                            statusFieldFocused.value = false;
                            phoneNumberFieldFocused.value = false;
                          },
                          validator: (value) => validateText(
                            value,
                            lang.translate('departmentIsRequired'),
                          ),
                          autovalidateMode: designationFieldFocused.value
                              ? AutovalidateMode.onUserInteraction
                              : AutovalidateMode.disabled,
                          items: departmentOptions.map((department) {
                            return DropdownMenuItem(
                              value: department,
                              child: Text(
                                department,
                                style: theme.textTheme.bodyMedium
                                    ?.copyWith(fontWeight: FontWeight.w500),
                              ),
                            );
                          }).toList(),
                        ),
                      ),
                      const SizedBox(height: 15),
                      Text(
                        lang.translate("email"),
                        style: theme.textTheme.bodyMedium?.copyWith(
                            fontWeight: FontWeight.w500, color: colorGrey500),
                      ),
                      const SizedBox(height: 5),
                      Obx(
                        () => TextFormField(
                          style: theme.textTheme.bodyLarge?.copyWith(
                              fontWeight: FontWeight.w500,
                              color: themeController.isDarkMode
                                  ? colorWhite
                                  : colorGrey900),
                          focusNode: f2,
                          validator: (value) => validateEmail(value, context),
                          onFieldSubmitted: (v) {
                            f2.unfocus();
                            FocusScope.of(context).requestFocus(f3);
                          },
                          onChanged: (value) {
                            userNameFieldFocused.value = false;
                            designationFieldFocused.value = false;
                            departmentFieldFocused.value = false;
                            emailFieldFocused.value = true;
                            statusFieldFocused.value = false;
                            phoneNumberFieldFocused.value = false;
                          },
                          autovalidateMode: emailFieldFocused.value
                              ? AutovalidateMode.onUserInteraction
                              : AutovalidateMode.disabled,
                          controller: emailController,
                          textInputAction: TextInputAction.next,
                          keyboardType: TextInputType.emailAddress,
                          decoration: inputDecoration(context,
                              hintText: AppLocalizations.of(context)
                                  .translate("enterEmail")),
                        ),
                      ),
                      const SizedBox(height: 15),
                      Text(
                        lang.translate("phoneNumber"),
                        style: theme.textTheme.bodyMedium?.copyWith(
                            fontWeight: FontWeight.w500, color: colorGrey500),
                      ),
                      const SizedBox(height: 5),
                      Obx(
                        () => TextFormField(
                          style: theme.textTheme.bodyLarge?.copyWith(
                              fontWeight: FontWeight.w500,
                              color: themeController.isDarkMode
                                  ? colorWhite
                                  : colorGrey900),
                          focusNode: f3,
                          validator: (value) =>
                              validatePhoneNumber(value!, context),
                          onFieldSubmitted: (v) {
                            f3.unfocus();
                            FocusScope.of(context).requestFocus(f4);
                          },
                          onChanged: (value) {
                            userNameFieldFocused.value = false;
                            designationFieldFocused.value = false;
                            departmentFieldFocused.value = false;
                            emailFieldFocused.value = false;
                            statusFieldFocused.value = false;
                            phoneNumberFieldFocused.value = true;
                          },
                          autovalidateMode: phoneNumberFieldFocused.value
                              ? AutovalidateMode.onUserInteraction
                              : AutovalidateMode.disabled,
                          controller: phoneNumberController,
                          textInputAction: TextInputAction.next,
                          keyboardType:
                              TextInputType.numberWithOptions(signed: false),
                          decoration: inputDecoration(
                            context,
                            hintText: lang.translate("enterPhoneNumber"),
                          ),
                        ),
                      ),
                      const SizedBox(height: 15),
                      Text(
                        lang.translate("status"),
                        style: theme.textTheme.bodyMedium?.copyWith(
                            fontWeight: FontWeight.w500, color: colorGrey500),
                      ),
                      const SizedBox(height: 5),
                      Obx(
                        () => DropdownButtonFormField<String>(
                          decoration: inputDecoration(
                            context,
                          ),
                          hint: Text(
                            lang.translate('selectStatus'),
                            style: theme.textTheme.bodyLarge?.copyWith(
                              color: (themeController.isDarkMode
                                  ? colorGrey600
                                  : colorGrey300),
                              fontWeight: FontWeight.w400,
                            ),
                          ),
                          icon: SvgPicture.asset(
                            angleDownIcon,
                            colorFilter: ColorFilter.mode(
                                Get.isDarkMode ? Colors.white : colorGrey900,
                                BlendMode.srcIn),
                          ),
                          value: selectedStatus.value.isEmpty
                              ? null
                              : selectedStatus.value,
                          onChanged: (newValue) {
                            selectedStatus.value = newValue ?? '';
                            userNameFieldFocused.value = false;
                            designationFieldFocused.value = false;
                            departmentFieldFocused.value = false;
                            emailFieldFocused.value = false;
                            statusFieldFocused.value = true;
                            phoneNumberFieldFocused.value = false;
                          },
                          validator: (value) => validateText(
                            value,
                            lang.translate('statusIsRequired'),
                          ),
                          autovalidateMode: statusFieldFocused.value
                              ? AutovalidateMode.onUserInteraction
                              : AutovalidateMode.disabled,
                          items: statusOptions.map((status) {
                            return DropdownMenuItem(
                              value: status,
                              child: Text(
                                status,
                                style: theme.textTheme.bodyMedium
                                    ?.copyWith(fontWeight: FontWeight.w500),
                              ),
                            );
                          }).toList(),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 15),
              Divider(
                height: 1,
                color: themeController.isDarkMode ? colorGrey700 : colorGrey100,
              ),
              const SizedBox(height: 15),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20.0),
                child: Row(
                  children: [
                    Expanded(
                      child: CommonButton(
                          borderColor: themeController.isDarkMode
                              ? colorGrey700
                              : colorGrey100,
                          bgColor: themeController.isDarkMode
                              ? colorGrey900
                              : colorWhite,
                          textStyle: theme.textTheme.bodyMedium?.copyWith(
                              fontWeight: FontWeight.w500,
                              color: themeController.isDarkMode
                                  ? colorWhite
                                  : colorGrey900),
                          onPressed: () {
                            context.pop();
                          },
                          text: lang.translate("cancel")),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: CommonButton(
                        textStyle: theme.textTheme.bodyMedium?.copyWith(
                            fontWeight: FontWeight.w500, color: colorWhite),
                        onPressed: () {
                          if (formKey.currentState!.validate()) {
                            final result = UserModel(
                                id: '',
                                name: userNameController.text,
                                designation: selectedDesignation.value,
                                department: selectedDepartment.value,
                                email: emailController.text,
                                phone: phoneNumberController.text,
                                status: selectedStatus.value,
                                imageUrl: "");
                            Navigator.pop<UserModel>(context, result);
                          }
                        },
                        text: lang.translate("save"),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
            ],
          ),
        ),
      ),
    );
  }
}
