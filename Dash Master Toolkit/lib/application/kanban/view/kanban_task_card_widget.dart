
import '../kanban_imports.dart';

class KanbanTaskCardWidget extends StatelessWidget {
  final KanbanTaskData data;

  const KanbanTaskCardWidget({
    super.key,
    required this.data,
  });

  Color _getPriorityColor(String priority) {
    switch (priority.toLowerCase()) {
      case 'high':
        return Color(0xff0DBAB2);
      case 'medium':
        return Color(0xffFB8C00);
      case 'low':
        return Color(0xffF23045);
      default:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    ThemeData theme = Theme.of(context);
    ThemeController themeController = Get.put(ThemeController());
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: themeController.isDarkMode ? colorGrey900 : colorWhite,
        // borderRadius: BorderRadius.circular(12),
      ),
      padding: const EdgeInsets.all(10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Priority Badge
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: _getPriorityColor(data.priority).withValues(alpha: 0.10),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              data.priority,
              style: theme.textTheme.bodySmall?.copyWith(
                color: _getPriorityColor(data.priority),
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          const SizedBox(height: 8),

          // Task Title
          Text(
            data.title,
            style: theme.textTheme.bodyLarge?.copyWith(
              fontWeight: FontWeight.w500,
            ),
          ),

          const SizedBox(height: 4),

          // Description
          Text(
            data.description,
            style: theme.textTheme.bodyLarge?.copyWith(
                color: themeController.isDarkMode ? colorGrey500 : colorGrey400,
                fontWeight: FontWeight.w400),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),

          const SizedBox(height: 10),
          Divider(
            color: themeController.isDarkMode ? colorGrey700 : colorGrey100,
            thickness: 0.5,
          ),
          const SizedBox(height: 10),

          // Task Footer (Date & Avatars)
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              // Due Date
              Row(
                mainAxisAlignment: MainAxisAlignment.start,
                children: [
                  Icon(
                    Icons.calendar_month,
                    size: 16,
                    color: themeController.isDarkMode
                        ? colorGrey500
                        : colorGrey400,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    "${data.endDate.day} ${_getMonthName(data.endDate.month)}, ${data.endDate.year}",
                    style: theme.textTheme.bodySmall?.copyWith(
                        color: themeController.isDarkMode
                            ? colorGrey500
                            : colorGrey400,
                        fontWeight: FontWeight.w400),
                  ),
                ],
              ),

              Flexible(
                child: Container(
                    height: 32,
                    // width: double.maxFinite,
                    alignment: Alignment.centerRight,
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: List.generate(
                        data.users.length >= 4 ? 4 : data.users.length,
                        (index) {
                          final image = data.users[index].imagePath;
                          final initialOnly = index >= 3;
                          return Align(
                            widthFactor: 0.5,
                            child: Container(
                              width: 32,
                              height: 32,
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  border: Border.all(
                                      color: themeController.isDarkMode
                                          ? colorGrey900
                                          : colorWhite),
                                  color: themeController.isDarkMode
                                      ? colorGrey300
                                      : colorGrey100),
                              child: initialOnly
                                  ? Text(
                                      '+ ${data.users.length - 3}',
                                      style: theme.textTheme.bodySmall
                                          ?.copyWith(
                                              fontWeight: FontWeight.w500,
                                              color: colorGrey500),
                                      textAlign: TextAlign.center,
                                    )
                                  : commonCacheImageWidget(image, 32,
                                      width: 32),
                            ),
                          );
                        },
                      ),
                    )),
              )
            ],
          ),
        ],
      ),
    );
  }

  String _getMonthName(int month) {
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec"
    ];
    return monthNames[month - 1];
  }
}
