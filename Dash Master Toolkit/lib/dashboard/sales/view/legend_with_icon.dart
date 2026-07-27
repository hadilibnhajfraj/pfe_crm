import 'package:dash_master_toolkit/dashboard/sales/sales_imports.dart';


class LegendWithIcon extends StatelessWidget {
  final IconData icon;
  final String label;
  final String subLabel;
  final String value;
  final Color color;

  const LegendWithIcon({
    super.key,
    required this.icon,
    required this.label,
    required this.subLabel,
    required this.value,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    ThemeData theme = Theme.of(context);
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        CircleAvatar(
          backgroundColor: color.withValues(alpha: 0.2),
          radius: 16,
          child: HugeIcon(icon: icon, color: color, size: 16),
        ),
        SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.bodyMedium
                    ?.copyWith(fontWeight: FontWeight.w700),
              ),
              Text(
                subLabel,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: colorGrey500,
                ),
              ),
            ],
          ),
        ),
        SizedBox(width: 8),
        Text(
          value,
          style: theme.textTheme.bodyMedium
              ?.copyWith(fontWeight: FontWeight.w700, color: color),
        ),
      ],
    );
  }
}
