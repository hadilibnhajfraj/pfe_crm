import 'package:dash_master_toolkit/tables/table_imports.dart';
import 'package:responsive_framework/responsive_framework.dart' as rf;

class HoverTableScreen extends StatefulWidget {
  const HoverTableScreen({super.key});

  @override
  State<HoverTableScreen> createState() => _HoverTableScreenState();
}

class _HoverTableScreenState extends State<HoverTableScreen> {
  ThemeController themeController = Get.put(ThemeController());

  int? _sortColumnIndex;
  bool _sortAscending = true;

  List<Map<String, dynamic>> data = [
    {
      "author": "Top Authors",
      "subtitle": "Successful Fellas",
      "avatar": "https://i.ibb.co/r2CNfH9d/user-4-18ed1a2b.jpg",
      "courses": ["Angular", "PHP"],
      "users": 4300,
      "isSelected": false,
    },
    {
      "author": "Popular Authors",
      "subtitle": "Most Successful",
      "avatar": "https://i.ibb.co/Q3LWwh4g/user-5-111bbb24.jpg",
      "courses": ["Bootstrap"],
      "users": 1200,
      "isSelected": false,
    },
    {
      "author": "New Users",
      "subtitle": "Awesome Users",
      "avatar": "https://i.ibb.co/9HcvS6L3/user-10-0e467bdd.jpg",
      "courses": ["ReactJS", "Angular"],
      "users": 2000,
      "isSelected": false,
    },
    {
      "author": "Active Customers",
      "subtitle": "Best Customers",
      "avatar": "https://i.ibb.co/5WcDdXQJ/user-12-63176adc.jpg",
      "courses": ["Bootstrap"],
      "users": 1500,
      "isSelected": false,
    },
    {
      "author": "Bestseller Theme",
      "subtitle": "Amazing Templates",
      "avatar": "https://i.ibb.co/9HcvS6L3/user-10-0e467bdd.jpg",
      "courses": ["Angular", "ReactJS"],
      "users": 9500,
      "isSelected": false,
    },
  ];

  void _sort<T>(Comparable<T> Function(Map<String, dynamic> d) getField,
      int columnIndex, bool ascending) {
    data.sort((a, b) {
      final aValue = getField(a);
      final bValue = getField(b);
      return ascending
          ? Comparable.compare(aValue, bValue)
          : Comparable.compare(bValue, aValue);
    });
    setState(() {
      _sortColumnIndex = columnIndex;
      _sortAscending = ascending;
    });
  }

  Color getCourseColor(String course) {
    switch (course) {
      case 'Angular':
        return Color(0xff00a1ff);
      case 'ReactJS':
        return Color(0xffff6692);
      default:
        return Color(0xff8965e5);
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

  bool _selectAll = false;

  void _selectAllRows(bool select) {
    setState(() {
      _selectAll = select;
      for (var user in data) {
        user['isSelected'] = select;
      }
    });
  }

  Widget _buildTable(
    AppLocalizations lang,
    TextStyle titleTextStyle,
    TextStyle rowTextStyle,
    TextStyle menuTextStyle,
  ) {
    return LayoutBuilder(builder: (context, constraints) {
      return SingleChildScrollView(
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
              checkboxTheme: CheckboxThemeData(
                side: BorderSide(
                  color: colorGrey500,
                  width: 1.0,
                ),
              ),
            ),
            child: Container(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(8.0),
                border: Border.all(
                  color:
                      themeController.isDarkMode ? colorGrey700 : colorGrey100,
                  width: 1.0,
                ),
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(8.0),
                child: DataTable(
                  headingRowColor: WidgetStateProperty.all(
                      themeController.isDarkMode ? colorGrey700 : colorGrey50),
                  border: TableBorder(
                    borderRadius: BorderRadius.circular(8.0),
                    horizontalInside: BorderSide(
                        color: themeController.isDarkMode
                            ? colorGrey700
                            : colorGrey100,
                        width: 0.8),
                  ),
                  dividerThickness: 1.0,
                  headingRowHeight: 50,
                  dataRowHeight: 70,
                  showCheckboxColumn: false,
                  sortColumnIndex: _sortColumnIndex,
                  sortAscending: _sortAscending,
                  columns: [
                    DataColumn(
                      label: Row(
                        children: [
                          Checkbox(
                            activeColor: colorPrimary100,
                            value: _selectAll,
                            onChanged: (value) {
                              _selectAllRows(value ?? false);
                            },
                          ),
                          const SizedBox(width: 12.0),
                          Text('${lang.translate('SL')}.'),
                        ],
                      ),
                    ),
                    DataColumn(
                      label: Text(
                        lang.translate("authors"),
                        style: titleTextStyle,
                      ),
                      onSort: (columnIndex, ascending) =>
                          _sort((d) => d["author"], columnIndex, ascending),
                    ),
                    DataColumn(
                      label: Text(
                        lang.translate("courses"),
                        style: titleTextStyle,
                      ),
                    ),
                    DataColumn(
                      label: Text(
                        lang.translate("users"),
                        style: titleTextStyle,
                      ),
                      // numeric: true,
                      onSort: (columnIndex, ascending) =>
                          _sort((d) => d["users"], columnIndex, ascending),
                    ),
                    DataColumn(label: SizedBox()),
                  ],
                  rows: List.generate(data.length, (index) {
                    final row = data[index];
                    return DataRow.byIndex(
                      index: index,
                      cells: [
                        DataCell(
                          Row(
                            children: [
                              Checkbox(
                                activeColor: colorPrimary100,
                                value: row['isSelected'],
                                onChanged: (selected) {
                                  setState(
                                    () {
                                      row['isSelected'] = selected ?? false;
                                      _selectAll =
                                          data.every((u) => u['isSelected']);
                                    },
                                  );
                                },
                              ),
                              const SizedBox(width: 12.0),
                              Text(
                                (index + 1).toString(),
                                style: rowTextStyle,
                              ),
                            ],
                          ),
                        ),
                        DataCell(
                          Row(
                            children: [
                              ClipOval(
                                child: commonCacheImageWidget(
                                  row['avatar'],
                                  40,
                                  width: 40,
                                ),
                              ),
                              SizedBox(width: 12),
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Text(row['author'],
                                      style: rowTextStyle.copyWith(
                                          fontWeight: FontWeight.w600)),
                                  Text(row['subtitle'],
                                      style: rowTextStyle.copyWith(
                                          color: themeController.isDarkMode
                                              ? colorGrey500
                                              : colorGrey400,
                                          fontSize: 12)),
                                ],
                              )
                            ],
                          ),
                        ),
                        DataCell(
                          Row(
                            children: row['courses'].map<Widget>((course) {
                              return Container(
                                margin: EdgeInsets.only(right: 6),
                                padding: EdgeInsets.symmetric(
                                    horizontal: 8, vertical: 4),
                                decoration: BoxDecoration(
                                  color: getCourseColor(course)
                                      .withValues(alpha: 0.2),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Text(course,
                                    style: rowTextStyle.copyWith(
                                        fontSize: 12,
                                        color: getCourseColor(course))),
                              );
                            }).toList(),
                          ),
                        ),
                        DataCell(
                          Text(
                            "${row['users']} Users",
                            style: rowTextStyle.copyWith(
                                fontWeight: FontWeight.w500),
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
                      onSelectChanged: (selected) {},
                      color: WidgetStateProperty.resolveWith<Color?>(
                          (Set<WidgetState> states) {
                        if (states.contains(WidgetState.pressed)) {
                          return Colors.transparent; // Clicked/pressed state
                        } else if (states.contains(WidgetState.hovered)) {
                          return themeController.isDarkMode
                              ? colorGrey800
                              : colorGrey25;
                        }
                        return null;
                      }),
                      // onSelectChanged: (_) {},
                      // Use MouseRegion to simulate hover
                      selected: row['isSelected'],
                    );
                  }).toList(),
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
