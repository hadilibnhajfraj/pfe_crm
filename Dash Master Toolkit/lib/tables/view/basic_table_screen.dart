import 'package:dash_master_toolkit/tables/table_imports.dart';
import 'package:responsive_framework/responsive_framework.dart' as rf;

class BasicTableScreen extends StatefulWidget {
  const BasicTableScreen({super.key});

  @override
  State<BasicTableScreen> createState() => _BasicTableScreenState();
}

class _BasicTableScreenState extends State<BasicTableScreen> {
  final BasicTableController controller = Get.put(BasicTableController());
  ThemeController themeController = Get.put(ThemeController());

  Color getUserStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'active':
        return Color(0xff00A2FF);
      case 'cancel':
        return Color(0xffFF6995);
      case 'pending':
        return Color(0xff3AD5C1);
      default:
        return Color(0xffFF6995);
    }
  }

  Color getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'paid':
        return Color(0xff00a1ff);
      case 'cancelled':
        return Color(0xffff6692);
      case 'refunded':
        return Color(0xff8965e5);
      default:
        return Colors.grey;
    }
  }

  IconData getStatusIcon(String status) {
    switch (status.toLowerCase()) {
      case 'paid':
        return Icons.check_circle_outline;
      case 'cancelled':
        return Icons.cancel_outlined;
      case 'refunded':
        return Icons.refresh_outlined;
      default:
        return Icons.info_outline;
    }
  }

  @override
  Widget build(BuildContext context) {
    AppLocalizations lang = AppLocalizations.of(context);
    ThemeData theme = Theme.of(context);
    final isMobile = responsiveValue<bool>(
      context,
      xs: true,
      sm: true,
      md: false,
      lg: false,
      xl: false,
    );

    var titleTextStyle = theme.textTheme.titleMedium?.copyWith(
      fontWeight: FontWeight.w600,
    );

    var rowTextStyle = theme.textTheme.bodyLarge
        ?.copyWith(fontWeight: FontWeight.w600, fontSize: isMobile ? 14 : 16);

    var menuTextStyle = theme.textTheme.bodyMedium
        ?.copyWith(fontWeight: FontWeight.w400, fontSize: isMobile ? 12 : 14);

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
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildTable1(lang, titleTextStyle!, rowTextStyle!, menuTextStyle!),
            SizedBox(
              height: 25,
            ),
            _buildTable2(lang, titleTextStyle, rowTextStyle, menuTextStyle),
          ],
        ),
      ),
    );
  }

  _buildTable1(
    AppLocalizations lang,
    TextStyle titleTextStyle,
    TextStyle rowTextStyle,
    TextStyle menuTextStyle,
  ) {
    var imageSize = 35.0;
    return LayoutBuilder(builder: (context, constraints) {
      bool isMobile = constraints.maxWidth < 600;
      return Obx(
        () => SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: ConstrainedBox(
            constraints: BoxConstraints(minWidth: constraints.maxWidth),
            child: Theme(
              data: Theme.of(context).copyWith(
                dividerColor: Colors.transparent,
                dividerTheme: const DividerThemeData(
                  color: Colors.transparent,
                  space: 0,
                  thickness: 0,
                  indent: 0,
                  endIndent: 0,
                ),
              ),
              child: Container(
                decoration: BoxDecoration(
                  borderRadius: BorderRadiusDirectional.circular(8.0),
                  border: Border.all(
                    color: themeController.isDarkMode
                        ? colorGrey700
                        : colorGrey100,
                    width: 1.0,
                  ),
                ),
                child: ClipRRect(
                  borderRadius: BorderRadiusDirectional.circular(8.0),
                  child: DataTable(
                    border: TableBorder(
                      borderRadius: BorderRadius.circular(8.0),
                      horizontalInside: BorderSide(
                        color: themeController.isDarkMode
                            ? colorGrey700
                            : colorGrey100,
                      ),
                    ),
                    dividerThickness: 1.0,
                    horizontalMargin: 16.0,
                    headingRowColor: WidgetStateColor.transparent,
                    // col: WidgetStatePropertyAll(themeController.isDarkMode ? colorGrey700 : colorGrey100),
                    columnSpacing: 24,
                    dataRowMaxHeight: 60,
                    columns: [
                      DataColumn(
                        label: Text(
                          lang.translate("SL"),
                          style: titleTextStyle,
                        ),
                      ),
                      DataColumn(
                        label: Text(
                          lang.translate("user"),
                          style: titleTextStyle,
                        ),
                      ),
                      DataColumn(
                        label: Text(
                          lang.translate("projectName"),
                          style: titleTextStyle,
                        ),
                      ),
                      DataColumn(
                        label: Text(
                          lang.translate("users"),
                          style: titleTextStyle,
                        ),
                      ),
                      DataColumn(
                        label: Text(
                          lang.translate("status"),
                          style: titleTextStyle,
                        ),
                      ),
                      DataColumn(label: Text("")),
                    ],
                    rows: List.generate(controller.users.length, (index) {
                      final user = controller.users[index];
                      return DataRow(
                        cells: [
                          DataCell(
                            Text(
                              (index + 1).toString(),
                              style: rowTextStyle,
                            ),
                          ),
                          DataCell(
                            Row(
                              children: [
                                CircleAvatar(
                                  backgroundImage:
                                      AssetImage(user.userAvatars.first),
                                ),
                                SizedBox(width: 8),
                                Text(
                                  user.name,
                                  style: rowTextStyle,
                                ),
                              ],
                            ),
                          ),
                          DataCell(
                            Text(
                              user.projectName,
                              style:
                                  rowTextStyle.copyWith(color: colorGrey500),
                            ),
                          ),
                          DataCell(
                            Container(
                              height: 32,
                              // width: double.maxFinite,
                              alignment: Alignment.centerRight,
                              child: Row(
                                // mainAxisAlignment: MainAxisAlignment.end,
                                children: List.generate(
                                  user.userAvatars.length >= 4
                                      ? 4
                                      : user.userAvatars.length,
                                  (index) {
                                    final image = user.userAvatars[index];
                                    final initialOnly = index >= 3;
                                    return Align(
                                      widthFactor: 0.6,
                                      child: Container(
                                        width: imageSize,
                                        height: imageSize,
                                        alignment: Alignment.center,
                                        decoration: BoxDecoration(
                                            shape: BoxShape.circle,
                                            border: Border.all(
                                                color:
                                                    themeController.isDarkMode
                                                        ? colorGrey900
                                                        : colorWhite),
                                            color: themeController.isDarkMode
                                                ? colorGrey300
                                                : colorGrey100),
                                        child: initialOnly
                                            ? Text(
                                                '+ ${user.userAvatars.length - 3}',
                                                style: rowTextStyle.copyWith(
                                                    fontSize: 12,
                                                    fontWeight:
                                                        FontWeight.w500,
                                                    color: colorGrey500),
                                                textAlign: TextAlign.center,
                                              )
                                            : Image.asset(image,
                                                height: imageSize,
                                                width: imageSize),
                                      ),
                                    );
                                  },
                                ),
                              ),
                            ),
                          ),
                          DataCell(
                            Container(
                              padding: EdgeInsets.symmetric(
                                  horizontal: 12, vertical: 4),
                              decoration: BoxDecoration(
                                color: getUserStatusColor(user.status)
                                    .withValues(alpha: 0.2),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Text(
                                user.status,
                                style: rowTextStyle.copyWith(
                                    fontSize: isMobile ? 14 : 12,
                                    color: getUserStatusColor(user.status),
                                    fontWeight: FontWeight.w500),
                              ),
                            ),
                          ),
                          DataCell(
                            Align(
                              alignment: Alignment.centerRight,
                              child: PopupMenuButton<String>(
                                icon: Icon(
                                  Icons.more_vert,
                                  color: colorGrey500,
                                ),
                                onSelected: (value) {
                                  if (value == 'add') {
                                    // TODO: Handle Add
                                  } else if (value == 'edit') {
                                    // TODO: Handle Edit
                                  } else if (value == 'delete') {
                                    // TODO: Handle Delete
                                  }
                                },
                                itemBuilder: (BuildContext context) =>
                                    <PopupMenuEntry<String>>[
                                  PopupMenuItem<String>(
                                    value: 'add',
                                    child: ListTile(
                                      leading:
                                          _buildCommonIconWidget(addCircleIcon),
                                      title: Text(
                                        'Add',
                                        style: menuTextStyle,
                                      ),
                                    ),
                                  ),
                                  PopupMenuItem<String>(
                                    value: 'edit',
                                    child: ListTile(
                                      leading:
                                          _buildCommonIconWidget(editPenIcon),
                                      title: Text(
                                        'Edit',
                                        style: menuTextStyle,
                                      ),
                                    ),
                                  ),
                                  PopupMenuItem<String>(
                                    value: 'delete',
                                    child: ListTile(
                                      leading:
                                          _buildCommonIconWidget(deleteIcon2),
                                      title: Text(
                                        'Delete',
                                        style: menuTextStyle,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      );
                    }).toList(),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    });
  }

  _buildTable2(
    AppLocalizations lang,
    TextStyle titleTextStyle,
    TextStyle rowTextStyle,
    TextStyle menuTextStyle,
  ) {
    return LayoutBuilder(builder: (context, constraints) {
      bool isMobile = constraints.maxWidth < 600;
      return Obx(
        () => SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: ConstrainedBox(
            constraints: BoxConstraints(minWidth: constraints.maxWidth),
            child: Theme(
              data: Theme.of(context).copyWith(
                dividerColor: Colors.transparent,
                dividerTheme: const DividerThemeData(
                  color: Colors.transparent,
                  space: 0,
                  thickness: 0,
                  indent: 0,
                  endIndent: 0,
                ),
              ),
              child: Container(
                decoration: BoxDecoration(
                  borderRadius: BorderRadiusDirectional.circular(8.0),
                  border: Border.all(
                    color: themeController.isDarkMode
                        ? colorGrey700
                        : colorGrey100,
                    width: 1.0,
                  ),
                ),
                child: ClipRRect(
                  borderRadius: BorderRadiusDirectional.circular(8.0),
                  child: DataTable(
                    border: TableBorder(
                      borderRadius: BorderRadius.circular(8.0),
                      horizontalInside: BorderSide(
                        color: themeController.isDarkMode
                            ? colorGrey700
                            : colorGrey100,
                      ),
                    ),
                    dividerThickness: 1.0,
                    horizontalMargin: 16.0,
                    headingRowColor: WidgetStateColor.transparent,
                    // col: WidgetStatePropertyAll(themeController.isDarkMode ? colorGrey700 : colorGrey100),
                    columnSpacing: 24,
                    dataRowMaxHeight: 65,
                    columns: [
                      DataColumn(
                        label: Text(
                          lang.translate("invoice"),
                          style: titleTextStyle,
                        ),
                      ),
                      DataColumn(
                        label: Text(
                          lang.translate("status"),
                          style: titleTextStyle,
                        ),
                      ),
                      DataColumn(
                        label: Text(
                          lang.translate("customer"),
                          style: titleTextStyle,
                        ),
                      ),
                      DataColumn(
                        label: Text(
                          lang.translate("progress"),
                          style: titleTextStyle,
                        ),
                      ),
                      DataColumn(label: Text("")),
                    ],
                    rows: List.generate(controller.invoices.length, (index) {
                      final invoice = controller.invoices[index];
                      return DataRow(
                        cells: [
                          DataCell(
                            Text(
                              invoice.invoiceId,
                              style: rowTextStyle,
                            ),
                          ),
                          DataCell(
                            Container(
                              padding: EdgeInsets.symmetric(
                                  horizontal: 12, vertical: 4),
                              decoration: BoxDecoration(
                                color: getStatusColor(invoice.status)
                                    .withValues(alpha: 0.1),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(getStatusIcon(invoice.status),
                                      size: 15,
                                      color: getStatusColor(invoice.status)),
                                  SizedBox(width: 6),
                                  Text(
                                    invoice.status,
                                    style: rowTextStyle.copyWith(
                                      fontSize: isMobile ? 14 : 12,
                                      color: getStatusColor(invoice.status),
                                      fontWeight: FontWeight.w500,
                                    ),
                                  )
                                ],
                              ),
                            ),
                          ),
                          DataCell(
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.center,
                              children: [
                                ClipOval(
                                    child: commonCacheImageWidget(
                                  invoice.avatar,
                                  40,
                                  width: 40,
                                )),
                                SizedBox(width: 8),
                                Center(
                                  child: Padding(
                                    padding: const EdgeInsets.only(top: 8.0),
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(invoice.customerName,
                                            style: rowTextStyle.copyWith(
                                                fontWeight: FontWeight.w600)),
                                        Text(invoice.customerEmail,
                                            style: rowTextStyle.copyWith(
                                                fontWeight: FontWeight.w500,
                                                fontSize: 14,
                                                color:
                                                    themeController.isDarkMode
                                                        ? colorGrey500
                                                        : colorGrey400)),
                                      ],
                                    ),
                                  ),
                                )
                              ],
                            ),
                          ),
                          DataCell(
                            Row(
                              children: [
                                SizedBox(
                                  width: 100,
                                  child: LinearProgressIndicator(
                                    value: invoice.progress / 100,
                                    backgroundColor: themeController.isDarkMode
                                        ? colorGrey700
                                        : colorGrey100,
                                    color: Colors.blue,
                                  ),
                                ),
                                SizedBox(width: 12),
                                Text(
                                  '${invoice.progress}%',
                                  style: rowTextStyle,
                                ),
                              ],
                            ),
                          ),
                          DataCell(
                            Align(
                              alignment: Alignment.centerRight,
                              child: PopupMenuButton<String>(
                                icon: Icon(
                                  Icons.more_vert,
                                  color: colorGrey500,
                                ),
                                onSelected: (value) {
                                  if (value == 'add') {
                                    // TODO: Handle Add
                                  } else if (value == 'edit') {
                                    // TODO: Handle Edit
                                  } else if (value == 'delete') {
                                    // TODO: Handle Delete
                                  }
                                },
                                itemBuilder: (BuildContext context) =>
                                    <PopupMenuEntry<String>>[
                                  PopupMenuItem<String>(
                                    value: 'add',
                                    child: ListTile(
                                      leading:
                                          _buildCommonIconWidget(addCircleIcon),
                                      title: Text(
                                        'Add',
                                        style: menuTextStyle,
                                      ),
                                    ),
                                  ),
                                  PopupMenuItem<String>(
                                    value: 'edit',
                                    child: ListTile(
                                      leading:
                                          _buildCommonIconWidget(editPenIcon),
                                      title: Text(
                                        'Edit',
                                        style: menuTextStyle,
                                      ),
                                    ),
                                  ),
                                  PopupMenuItem<String>(
                                    value: 'delete',
                                    child: ListTile(
                                      leading:
                                          _buildCommonIconWidget(deleteIcon2),
                                      title: Text(
                                        'Delete',
                                        style: menuTextStyle,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      );
                    }).toList(),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    });
  }

  _buildCommonIconWidget(String assetName) {
    return SvgPicture.asset(
      assetName,
      width: 18,
      height: 18,
      colorFilter: ColorFilter.mode(
          themeController.isDarkMode ? colorWhite : colorGrey900,
          BlendMode.srcIn),
    );
  }
}
