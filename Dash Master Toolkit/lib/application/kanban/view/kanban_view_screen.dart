import '../kanban_imports.dart';
import 'package:responsive_framework/responsive_framework.dart' as rf;

class KanbanViewScreen extends StatefulWidget {
  const KanbanViewScreen({super.key});

  @override
  State<KanbanViewScreen> createState() => _KanbanViewScreenState();
}

class _KanbanViewScreenState extends State<KanbanViewScreen> {
  final KanbanController kanbanController = Get.put(KanbanController());
  ThemeController themeController = Get.put(ThemeController());

  @override
  void initState() {
    kanbanController.initializeBoard();
    super.initState();
  }

  @override
  Widget build(BuildContext context) {
    final config = AppFlowyBoardConfig(
      groupBackgroundColor:
          themeController.isDarkMode ? colorGrey700 : colorGrey50,
      stretchGroupHeight: false,
      groupMargin: const EdgeInsets.symmetric(horizontal: 12),
      cardMargin: const EdgeInsets.all(20),
      groupBodyPadding: const EdgeInsets.all(12),
    );

    AppLocalizations lang = AppLocalizations.of(context);
    // ThemeData theme = Theme.of(context);
    final sizeInfo = rf.ResponsiveValue<_SizeInfo>(
      context,
      conditionalValues: [
        const rf.Condition.between(
          start: 0,
          end: 480,
          value: _SizeInfo(
            alertFontSize: 12,
            padding: EdgeInsetsDirectional.all(16),
            innerSpacing: 16,
          ),
        ),
        const rf.Condition.between(
          start: 481,
          end: 576,
          value: _SizeInfo(
            alertFontSize: 14,
            padding: EdgeInsetsDirectional.all(16),
            innerSpacing: 16,
          ),
        ),
        const rf.Condition.between(
          start: 577,
          end: 992,
          value: _SizeInfo(
            alertFontSize: 14,
            padding: EdgeInsetsDirectional.all(16),
            innerSpacing: 16,
          ),
        ),
      ],
      defaultValue: const _SizeInfo(),
    ).value;

    return Scaffold(
      backgroundColor: themeController.isDarkMode ? colorGrey900 : colorWhite,
      body: Container(
        // height: screenHeight,
        //  Make sure the parent container is full height
        padding: sizeInfo.padding,

        child: AppFlowyBoard(
          controller: kanbanController.controller,
          cardBuilder: (context, group, groupItem) {
            final task = groupItem as KanbanTaskData;
            return AppFlowyGroupCard(
              key: ValueKey(groupItem.id),
              child: KanbanTaskCardWidget(
                data: task,
              ),
            );
          },
          groupConstraints: const BoxConstraints.tightFor(width: 375),
          boardScrollController: kanbanController.boardScrollController,
          trailing: Padding(
            padding: const EdgeInsetsDirectional.only(start: 24),
            child: ElevatedButton.icon(
              onPressed: () async {
                final result = await showDialog<AppFlowyGroupData<Color>?>(
                  context: context,
                  builder: (context) => const AddKanbanBoardDialog(),
                );

                if (result != null) {
                  kanbanController.controller.addGroup(result);
                }
              },
              icon: Icon(
                Icons.add_circle_outline_outlined,
                color: themeController.isDarkMode
                    ? colorPrimary100
                    : colorPrimary300,
              ),
              label: Text(lang.translate('addNewBoard')),
              style: ElevatedButton.styleFrom(
                  shape: RoundedRectangleBorder(
                    borderRadius:
                        BorderRadius.circular(6), // Adjust the radius here
                  ),
                  elevation: 0,
                  fixedSize: const Size.fromWidth(372),
                  backgroundColor:
                      themeController.isDarkMode ? colorGrey700 : colorGrey50,
                  foregroundColor: themeController.isDarkMode
                      ? colorPrimary100
                      : colorPrimary300),
            ),
          ),
          headerBuilder: (context, groupData) => _buildGroupHeader(
            context,
            groupData,
          ),
          config: config,
        ),
      ),
    );
  }

  Widget _buildGroupHeader(
    BuildContext context,
    AppFlowyGroupData groupData,
  ) {
    final theme = Theme.of(context);
    return Container(
      width: double.maxFinite,
      padding: const EdgeInsetsDirectional.symmetric(vertical: 10),
      decoration: BoxDecoration(
        color: themeController.isDarkMode ? colorGrey700 : colorGrey50,
      ),
      child: Container(
        decoration: BoxDecoration(
          border: Border(
            left: BorderSide(
              color: groupData.customData ?? colorPrimary100,
              width: 2,
            ),
          ),
        ),
        padding:
            const EdgeInsetsDirectional.symmetric(vertical: 4, horizontal: 14),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              groupData.headerData.groupName,
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
            Flexible(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  IconButton(
                    onPressed: () {
                      return kanbanController.controller
                          .removeGroup(groupData.id);
                    },
                    icon: const Icon(Icons.delete_outline_sharp),
                    color:
                        themeController.isDarkMode ? colorWhite : colorGrey900,
                  ),
                  IconButton(
                    onPressed: () async {
                      final result = await showDialog<KanbanTaskData?>(
                        context: context,
                        builder: (context) => const AddKanbanProjectDialog(),
                      );

                      if (result != null) {
                        kanbanController.controller
                            .addGroupItem(groupData.id, result);
                      }
                    },
                    icon: const Icon(Icons.add_circle_outline),
                    color:
                        themeController.isDarkMode ? colorWhite : colorGrey900,
                  ),
                ],
              ),
            )
          ],
        ),
      ),
    );
  }

/*  void _handleViewTask(BuildContext context, KanbanTaskData item) async {
    await showDialog(
      context: context,
      builder: (context) => KanbanTaskViewerDialog(item: item),
    );
  }*/

  void _handleDeleteTask(
    BuildContext context, {
    required AppFlowyGroupData group,
    required KanbanTaskData item,
  }) async {
    return kanbanController.controller.removeGroupItem(
      group.id,
      item.id,
    );
  }
}

class _SizeInfo {
  final double? alertFontSize;
  final EdgeInsetsGeometry padding;
  final double innerSpacing;

  const _SizeInfo({
    this.alertFontSize = 18,
    this.padding = const EdgeInsetsDirectional.all(24),
    this.innerSpacing = 24,
  });
}
