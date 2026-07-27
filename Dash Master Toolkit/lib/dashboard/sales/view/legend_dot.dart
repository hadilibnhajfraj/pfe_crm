import 'package:dash_master_toolkit/dashboard/sales/sales_imports.dart';

class LegendDot extends StatelessWidget {
  final Color color;
  final String label;
  final String value;

  const LegendDot(
      {super.key,
      required this.color,
      required this.label,
      required this.value});

  @override
  Widget build(BuildContext context) {
    ThemeData theme = Theme.of(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 3.0),
          child: CircleAvatar(radius: 5, backgroundColor: color),
        ),
        SizedBox(width: 6),
        Column(
          mainAxisAlignment: MainAxisAlignment.start,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: theme.textTheme.bodySmall?.copyWith(
                color: colorGrey500,
              ),
            ),
            Text(
              value,
              style: theme.textTheme.bodyMedium
                  ?.copyWith(fontWeight: FontWeight.w700),
            ),
          ],
        ),
      ],
    );
  }
}
