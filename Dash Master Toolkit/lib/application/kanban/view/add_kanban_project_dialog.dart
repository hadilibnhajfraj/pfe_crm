import '../kanban_imports.dart';
import 'package:responsive_grid/responsive_grid.dart';

class AddKanbanProjectDialog extends StatefulWidget {
  const AddKanbanProjectDialog({super.key});

  @override
  State<AddKanbanProjectDialog> createState() => _AddKanbanProjectDialogState();
}

class _AddKanbanProjectDialogState extends State<AddKanbanProjectDialog> {
  ThemeController themeController = Get.put(ThemeController());
  AddKanbanProjectController controller = Get.put(AddKanbanProjectController());

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
                      lang.translate('addNewProject'),
                      style: theme.textTheme.titleLarge
                          ?.copyWith(fontWeight: FontWeight.w600, fontSize: 18),
                    ),
                    InkWell(
                      onTap: () {
                        controller.clearForm();
                        context.pop();
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
                  key: controller.formKey,
                  child: SingleChildScrollView(
                    padding: EdgeInsets.symmetric(
                        horizontal: isMobile ? 10 : 20, vertical: 10),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          lang.translate('projectName'),
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: colorGrey500,
                            fontWeight: FontWeight.w400,
                          ),
                        ),
                        const SizedBox(height: 10),
                        // Board Name
                        Obx(
                          () => TextFormField(
                            controller: controller.nameController,
                            decoration: inputDecoration(context,
                                hintText: lang.translate('boardName')),
                            validator: (value) => validateText(
                              value,
                              lang.translate('projectNameIsRequired'),
                            ),
                            focusNode: controller.f1,
                            onFieldSubmitted: (v) {
                              controller.f1.unfocus();
                              FocusScope.of(context)
                                  .requestFocus(controller.f2);
                            },
                            onChanged: (value) {
                              controller.nameFieldFocused.value = true;
                              controller.startDateFieldFocused.value = false;
                              controller.endDateFieldFocused.value = false;
                              controller.descriptionFieldFocused.value = false;
                              controller.priorityFieldFocused.value = false;
                            },
                            autovalidateMode: controller.nameFieldFocused.value
                                ? AutovalidateMode.onUserInteraction
                                : AutovalidateMode.disabled,
                            textInputAction: TextInputAction.next,
                            keyboardType: TextInputType.text,
                            style: theme.textTheme.bodyLarge?.copyWith(
                                fontWeight: FontWeight.w500,
                                color: themeController.isDarkMode
                                    ? colorWhite
                                    : colorGrey900),
                          ),
                        ),
                        const SizedBox(height: 20),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    AppLocalizations.of(context)
                                        .translate("startDate"),
                                    style: theme.textTheme.bodyMedium?.copyWith(
                                        fontWeight: FontWeight.w500,
                                        color: colorGrey500),
                                  ),
                                  const SizedBox(height: 5),
                                  Obx(
                                    () => InkWell(
                                      onTap: () {
                                        controller.selectStartDate(context);
                                      },
                                      child: AbsorbPointer(
                                        child: TextFormField(
                                          readOnly: true,
                                          style: theme.textTheme.bodyLarge
                                              ?.copyWith(
                                                  fontWeight: FontWeight.w500,
                                                  color:
                                                      themeController.isDarkMode
                                                          ? colorWhite
                                                          : colorGrey900),
                                          focusNode: controller.f2,
                                          validator: (value) => validateText(
                                              value,
                                              AppLocalizations.of(context)
                                                  .translate(
                                                      "selectStartDateRequired")),
                                          onFieldSubmitted: (v) {
                                            controller.f2.unfocus();
                                            FocusScope.of(context)
                                                .requestFocus(controller.f3);
                                          },
                                          onChanged: (value) {
                                            controller.nameFieldFocused.value =
                                                true;
                                            controller.startDateFieldFocused
                                                .value = true;
                                            controller.endDateFieldFocused
                                                .value = false;
                                            controller.descriptionFieldFocused
                                                .value = false;
                                            controller.priorityFieldFocused
                                                .value = false;
                                          },
                                          autovalidateMode: controller
                                                  .startDateFieldFocused.value
                                              ? AutovalidateMode
                                                  .onUserInteraction
                                              : AutovalidateMode.disabled,
                                          controller:
                                              controller.startDateController,
                                          textInputAction: TextInputAction.next,
                                          keyboardType: TextInputType.text,
                                          decoration: inputDecoration(context,
                                              hintText:
                                                  AppLocalizations.of(context)
                                                      .translate(
                                                          "selectStartDate")),
                                        ),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    AppLocalizations.of(context)
                                        .translate("endDate"),
                                    style: theme.textTheme.bodyMedium?.copyWith(
                                        fontWeight: FontWeight.w500,
                                        color: colorGrey500),
                                  ),
                                  const SizedBox(height: 5),
                                  Obx(
                                    () => InkWell(
                                      onTap: () {
                                        controller.selectEndDate(context);
                                      },
                                      child: AbsorbPointer(
                                        child: TextFormField(
                                          readOnly: true,
                                          style: theme.textTheme.bodyLarge
                                              ?.copyWith(
                                                  fontWeight: FontWeight.w500,
                                                  color:
                                                      themeController.isDarkMode
                                                          ? colorWhite
                                                          : colorGrey900),
                                          focusNode: controller.f3,
                                          validator: (value) => validateText(
                                              value,
                                              AppLocalizations.of(context)
                                                  .translate(
                                                      "selectEndDateRequired")),
                                          onFieldSubmitted: (v) {
                                            controller.f3.unfocus();
                                            FocusScope.of(context)
                                                .requestFocus(controller.f4);
                                          },
                                          onChanged: (value) {
                                            controller.nameFieldFocused.value =
                                                true;
                                            controller.startDateFieldFocused
                                                .value = false;
                                            controller.endDateFieldFocused
                                                .value = true;
                                            controller.descriptionFieldFocused
                                                .value = false;
                                            controller.priorityFieldFocused
                                                .value = false;
                                          },
                                          autovalidateMode: controller
                                                  .endDateFieldFocused.value
                                              ? AutovalidateMode
                                                  .onUserInteraction
                                              : AutovalidateMode.disabled,
                                          controller:
                                              controller.endDateController,
                                          textInputAction: TextInputAction.next,
                                          keyboardType: TextInputType.text,
                                          decoration: inputDecoration(context,
                                              hintText: AppLocalizations.of(
                                                      context)
                                                  .translate("selectEndDate")),
                                        ),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 20),
                        Text(
                          lang.translate('priority'),
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: colorGrey500,
                            fontWeight: FontWeight.w400,
                          ),
                        ),
                        const SizedBox(height: 10),
                        Obx(
                          () => DropdownButtonFormField<String>(
                            decoration: inputDecoration(
                              context,
                            ),
                            hint: Text(
                              lang.translate('selectPriority'),
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
                            value: controller.selectedPriority.value.isEmpty
                                ? null
                                : controller.selectedPriority.value,
                            onChanged: (newValue) {
                              controller.selectedPriority.value =
                                  newValue ?? '';

                              controller.nameFieldFocused.value = false;
                              controller.startDateFieldFocused.value = false;
                              controller.endDateFieldFocused.value = false;
                              controller.descriptionFieldFocused.value = false;
                              controller.priorityFieldFocused.value = true;
                            },
                            validator: (value) => validateText(
                              value,
                              lang.translate('priorityIsRequired'),
                            ),
                            autovalidateMode:
                                controller.priorityFieldFocused.value
                                    ? AutovalidateMode.onUserInteraction
                                    : AutovalidateMode.disabled,
                            items: controller.priorityOptions.map((priority) {
                              return DropdownMenuItem(
                                value: priority,
                                child: Text(
                                  priority,
                                  style: theme.textTheme.bodyMedium
                                      ?.copyWith(fontWeight: FontWeight.w500),
                                ),
                              );
                            }).toList(),
                          ),
                        ),
                        const SizedBox(height: 20),
                        Text(
                          lang.translate('assignedTo'),
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: colorGrey500,
                            fontWeight: FontWeight.w400,
                          ),
                        ),
                        const SizedBox(height: 10),
                        Obx(
                          () => GestureDetector(
                            onTap: () =>
                                showMultiSelectDialog(context, controller),
                            child: InputDecorator(
                              decoration: inputDecoration(context),
                              child: Wrap(
                                spacing: 8.0,
                                runSpacing: 8, // Space between rows
                                children: controller.selectedEmployees.isEmpty
                                    ? [
                                        Text(
                                          lang.translate("selectEmployees"),
                                          style: theme.textTheme.bodyLarge
                                              ?.copyWith(
                                            color: (themeController.isDarkMode
                                                ? colorGrey600
                                                : colorGrey300),
                                            fontWeight: FontWeight.w400,
                                          ),
                                        )
                                      ]
                                    : controller.selectedEmployees
                                        .map(
                                          (employee) => Padding(
                                            padding: EdgeInsets.only(top: 0.0),
                                            child: Chip(
                                              avatar: CircleAvatar(
                                                backgroundImage: AssetImage(
                                                    employee.imagePath),
                                              ),
                                              label: Text(
                                                employee.userName,
                                                style: theme.textTheme.bodySmall
                                                    ?.copyWith(
                                                        fontWeight:
                                                            FontWeight.w500),
                                              ),
                                              onDeleted: () {
                                                controller.selectedEmployees
                                                    .remove(employee);
                                              },
                                            ),
                                          ),
                                        )
                                        .toList(),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: 4),
                        Obx(
                          () => controller.saveButtonClicked.value
                              ? controller.selectedEmployees.isEmpty
                                  ? Text(
                                      lang.translate(
                                          "selectAtLeastOneEmployee"),
                                      style:
                                          theme.textTheme.bodySmall?.copyWith(
                                        color: Colors.red,
                                        fontWeight: FontWeight.w400,
                                      ),
                                    )
                                  : Wrap()
                              : Wrap(),
                        ),
                        const SizedBox(height: 20),
                        Text(
                          lang.translate("description"),
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
                            focusNode: controller.f5,
                            onFieldSubmitted: (v) {
                              controller.f5.unfocus();
                            },
                            onChanged: (value) {},
                            maxLines: 3,
                            controller: controller.descriptionController,
                            textInputAction: TextInputAction.newline,
                            keyboardType: TextInputType.multiline,
                            decoration: inputDecoration(context,
                                hintText: lang.translate("enterHere")),
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
                        onPressed: () {
                          controller.clearForm();
                          context.pop();
                        },
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
                          controller.saveButtonClicked.value = true;
                          if (controller.formKey.currentState?.validate() ==
                              true) {
                            final result = KanbanTaskData(
                              generateRandomId(),
                              title: controller.nameController.text,
                              description:
                                  controller.descriptionController.text,
                              startDate: controller.selectedStartDate.value ??
                                  DateTime.now(),
                              endDate: controller.selectedEndDate.value ??
                                  DateTime.now(),
                              users: controller.selectedEmployees,
                              priority: controller.selectedPriority.value,
                            );
                            controller.clearForm();
                            Navigator.pop<KanbanTaskData>(context, result);
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

void showMultiSelectDialog(
    BuildContext context, AddKanbanProjectController controller) {
  showDialog(
    context: context,
    builder: (context) {
      return Dialog(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
        ),
        child: LayoutBuilder(
          builder: (context, constraints) {
            double dialogWidth =
                constraints.maxWidth > 600 ? 500 : constraints.maxWidth * 0.9;
            double dialogHeight =
                constraints.maxHeight > 700 ? 500 : constraints.maxHeight * 0.7;

            return SizedBox(
              width: dialogWidth,
              height: dialogHeight,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Title
                  Padding(
                    padding: const EdgeInsets.all(20.0),
                    child: Text(
                      AppLocalizations.of(context).translate("selectEmployees"),
                      style: Theme.of(context)
                          .textTheme
                          .titleLarge
                          ?.copyWith(fontWeight: FontWeight.w600),
                    ),
                  ),

                  // Employee List
                  Expanded(
                    child: SingleChildScrollView(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: listOfTaskEmployee.map((employee) {
                          return Obx(
                            () => Padding(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 16.0, vertical: 4),
                              child: Row(
                                mainAxisAlignment:
                                    MainAxisAlignment.spaceBetween,
                                children: [
                                  // Avatar & Name
                                  Row(
                                    children: [
                                      CircleAvatar(
                                        backgroundImage:
                                            AssetImage(employee.imagePath),
                                      ),
                                      const SizedBox(width: 12),
                                      Text(
                                        employee.userName,
                                        style: Theme.of(context)
                                            .textTheme
                                            .bodyMedium
                                            ?.copyWith(
                                                fontWeight: FontWeight.w500),
                                      ),
                                    ],
                                  ),
                                  // Checkbox
                                  Checkbox(
                                    value: controller.selectedEmployees
                                        .contains(employee),
                                    activeColor: colorPrimary100,
                                    onChanged: (isChecked) {
                                      if (isChecked == true) {
                                        controller.selectedEmployees
                                            .add(employee);
                                      } else {
                                        controller.selectedEmployees
                                            .remove(employee);
                                      }
                                    },
                                  ),
                                ],
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                    ),
                  ),

                  // Done Button
                  Align(
                    alignment: Alignment.centerRight,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 50.0, vertical: 20),
                      child: CommonButton(
                          // width: dou,
                          height: 40,
                          textStyle: Theme.of(context)
                              .textTheme
                              .bodyMedium
                              ?.copyWith(
                                  fontWeight: FontWeight.w500,
                                  color: colorWhite),
                          onPressed: () {
                            context.pop();
                          },
                          text: AppLocalizations.of(context).translate("done")),
                    ),
                  ),
                ],
              ),
            );
          },
        ),
      );
    },
  );
}
