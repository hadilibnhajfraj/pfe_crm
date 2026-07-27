import 'package:dash_master_toolkit/pages/projects/projetcs_imports.dart';

class ProjectCard extends StatelessWidget {
  final ProjectModel project;

  const ProjectCard({super.key, required this.project});

  @override
  Widget build(BuildContext context) {
    ThemeController themeController = Get.put(ThemeController());
    ThemeData theme = Theme.of(context);
    AppLocalizations lang = AppLocalizations.of(context);

    double horizontalPadding = 10;
    return Card(
      elevation: 2,
      color: themeController.isDarkMode ? colorDark : colorWhite,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 15.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: EdgeInsets.symmetric(horizontal: horizontalPadding),
              child: Row(
                children: [
                  SvgPicture.asset(
                    project.iconPath,
                    height: 30,
                    width: 30,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    project.title,
                    style: theme.textTheme.bodyLarge
                        ?.copyWith(fontWeight: FontWeight.w600),
                  ),
                  const Spacer(),
                  IconButton(
                    icon: Icon(Icons.more_vert),
                    onPressed: () {},
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Padding(
              padding: EdgeInsets.symmetric(horizontal: horizontalPadding),
              child: Row(
                children: [
                  Icon(Icons.access_time, size: 14, color: colorGrey500),
                  const SizedBox(width: 4),
                  Text(
                    "${lang.translate('delivery')} - ${project.deliveryDate}",
                    style: theme.textTheme.bodySmall
                        ?.copyWith(color: colorGrey500),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 60),
            Divider(
              color: themeController.isDarkMode ? colorGrey700 : colorGrey100,
            ),
            const SizedBox(height: 10),
            Padding(
              padding: EdgeInsets.symmetric(horizontal: horizontalPadding),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          "${project.progress}% ${lang.translate('completed')}",
                          style: theme.textTheme.bodyMedium?.copyWith(
                              fontWeight: FontWeight.w500, color: colorGrey500),
                        ),
                        const SizedBox(height: 10),
                        LinearProgressIndicator(
                          value: project.progress / 100,
                          backgroundColor: Colors.grey.shade300,
                          color:
                              project.progress < 50 ? Colors.red : Colors.blue,
                        ),
                      ],
                    ),
                  ),
                  Flexible(
                    child: Container(
                        height: 32,
                        // width: double.maxFinite,
                        alignment: Alignment.centerRight,
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: List.generate(
                            project.teamMembers.length >= 3
                                ? 3
                                : project.teamMembers.length,
                            (index) {
                              final image = project.teamMembers[index];
                              final initialOnly = index >= 2;
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
                                          '+ ${project.teamMembers.length - 2}',
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
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
