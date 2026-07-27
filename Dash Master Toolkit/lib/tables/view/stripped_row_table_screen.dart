import 'package:dash_master_toolkit/tables/table_imports.dart';
import 'package:responsive_framework/responsive_framework.dart' as rf;

class StrippedRowTableScreen extends StatefulWidget {
  const StrippedRowTableScreen({super.key});

  @override
  State<StrippedRowTableScreen> createState() => _StrippedRowTableScreenState();
}

class _StrippedRowTableScreenState extends State<StrippedRowTableScreen> {
  final BasicTableController controller = Get.put(BasicTableController());
  ThemeController themeController = Get.put(ThemeController());


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
            _buildTable(lang, titleTextStyle!, rowTextStyle!, menuTextStyle!),
          ],
        ),
      ),
    );
  }


  Widget _buildTable(
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
                  borderRadius: BorderRadius.circular(8.0),
                  border: Border.all(
                    color: themeController.isDarkMode
                        ? colorGrey700
                        : colorGrey100,
                    width: 1.0,
                  ),
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(8.0),
                  child: DataTable(
                    // sortColumnIndex: controller.sortColumnIndex.value,
                    // sortAscending: controller.isAscending.value,
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
                    columnSpacing: 24,
                    dataRowMaxHeight: 65,
                    columns: [
                      DataColumn(
                        label: _sortableHeader(lang.translate("invoice"), 0,titleTextStyle),
                        onSort: (columnIndex, _) {
                          _sortData(columnIndex, (a, b) =>
                              _extractNumber(a.invoiceId).compareTo(_extractNumber(b.invoiceId)));
                        },
                      ),
                      DataColumn(
                        label: _sortableHeader(lang.translate("status"), 1,titleTextStyle),
                        onSort: (columnIndex, _) {
                          _sortData(columnIndex, (a, b) => a.status.compareTo(b.status));
                        },
                      ),
                      DataColumn(
                        label: _sortableHeader(lang.translate("customer"), 2,titleTextStyle),
                        onSort: (columnIndex, _) {
                          _sortData(columnIndex, (a, b) => a.customerName.compareTo(b.customerName));
                        },
                      ),
                      DataColumn(
                        label: _sortableHeader(lang.translate("progress"), 3,titleTextStyle),
                        // numeric: true,
                        onSort: (columnIndex, _) {
                          _sortData(columnIndex, (a, b) => a.progress.compareTo(b.progress));
                        },
                      ),
                      const DataColumn(label: Text(""), ), // Actions column
                    ],
                    rows: List.generate(controller.invoices.length, (index) {
                      final invoice = controller.invoices[index];
                      final isEven = index % 2 == 0;
                      final rowColor = isEven
                          ? (themeController.isDarkMode
                          ? colorGrey800
                          : colorGrey50)
                          : Colors.transparent;

                      return DataRow(
                        color: WidgetStatePropertyAll(rowColor),
                        cells: [
                          DataCell(
                            Text(invoice.invoiceId, style: rowTextStyle),
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
                                  Icon(
                                    getStatusIcon(invoice.status),
                                    size: 15,
                                    color: getStatusColor(invoice.status),
                                  ),
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
                                  ),
                                ),
                                SizedBox(width: 8),
                                Center(
                                  child: Padding(
                                    padding: const EdgeInsets.only(top: 8.0),
                                    child: Column(
                                      crossAxisAlignment:
                                      CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          invoice.customerName,
                                          style: rowTextStyle.copyWith(
                                              fontWeight: FontWeight.w600),
                                        ),
                                        Text(
                                          invoice.customerEmail,
                                          style: rowTextStyle.copyWith(
                                            fontWeight: FontWeight.w500,
                                            fontSize: 14,
                                            color: themeController.isDarkMode
                                                ? colorGrey500
                                                : colorGrey400,
                                          ),
                                        ),
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
                                    backgroundColor:
                                    themeController.isDarkMode
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
                                icon: Icon(Icons.more_vert, color: colorGrey500),
                                onSelected: (value) {
                                  if (value == 'add') {
                                    // Handle Add
                                  } else if (value == 'edit') {
                                    // Handle Edit
                                  } else if (value == 'delete') {
                                    // Handle Delete
                                  }
                                },
                                itemBuilder: (BuildContext context) =>
                                <PopupMenuEntry<String>>[
                                  PopupMenuItem<String>(
                                    value: 'add',
                                    child: ListTile(
                                      leading: _buildCommonIconWidget(
                                          addCircleIcon),
                                      title: Text('Add', style: menuTextStyle),
                                    ),
                                  ),
                                  PopupMenuItem<String>(
                                    value: 'edit',
                                    child: ListTile(
                                      leading:
                                      _buildCommonIconWidget(editPenIcon),
                                      title: Text('Edit', style: menuTextStyle),
                                    ),
                                  ),
                                  PopupMenuItem<String>(
                                    value: 'delete',
                                    child: ListTile(
                                      leading: _buildCommonIconWidget(
                                          deleteIcon2),
                                      title: Text('Delete', style: menuTextStyle),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      );
                    }),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    });
  }
  void _sortData(int columnIndex, int Function(dynamic a, dynamic b) compare) {
    if (controller.sortColumnIndex.value == columnIndex) {
      controller.isAscending.toggle();
    } else {
      controller.sortColumnIndex.value = columnIndex;
      controller.isAscending.value = true;
    }

    controller.invoices.sort((a, b) {
      final cmp = compare(a, b);
      return controller.isAscending.value ? cmp : -cmp;
    });
  }

  Widget _sortableHeader(String title, int index, TextStyle titleTextStyle) {
    // final isSorted = controller.sortColumnIndex.value == index;
    final ascending = controller.isAscending.value;

    return Row(
      children: [
        Text(title, style: titleTextStyle),
        // if (isSorted)
          Icon(
            ascending ? Icons.arrow_upward : Icons.arrow_downward,
            size: 16,
            color: colorGrey400,
          ),
      ],
    );
  }

  int _extractNumber(String id) {
    return int.tryParse(id.replaceAll(RegExp(r'\D'), '')) ?? 0;
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
