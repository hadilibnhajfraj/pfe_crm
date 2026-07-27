import 'package:dash_master_toolkit/dashboard/sales/sales_imports.dart';

class LegendItem extends StatelessWidget {
  final Color color;
  final String label;
  final String? amount;

  const LegendItem({super.key, required this.color, required this.label, this.amount});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Row(
          children: [
            Container(
              width: 12,
              height: 12,
              decoration: BoxDecoration(
                color: color,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 6),
            Text(
              label,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    fontWeight: FontWeight.w500,
                  ),
            ),
          ],
        ),
        if(amount!=null)
        SizedBox(height: 4),
        if(amount!=null)
        Text(
          amount!,
          style:  Theme.of(context).textTheme.bodySmall?.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}
