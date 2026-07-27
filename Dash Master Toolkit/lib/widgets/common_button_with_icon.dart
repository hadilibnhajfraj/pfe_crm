import 'package:flutter/material.dart';

class CommonButtonWithIcon extends StatelessWidget {
  final VoidCallback? onPressed;
  final String text;
  final IconData? icon;
  final Color backgroundColor;
  final TextStyle? textStyle;
  final double borderRadius;
  final EdgeInsets padding;

  const CommonButtonWithIcon({
    super.key,
    required this.onPressed,
    required this.text,
    this.icon,
    this.backgroundColor = Colors.blue,
    this.textStyle,
    this.borderRadius = 8.0,
    this.padding = const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
  });

  @override
  Widget build(BuildContext context) {
    return ElevatedButton(
      onPressed: onPressed,
      style: ElevatedButton.styleFrom(
        backgroundColor: backgroundColor,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(borderRadius),
        ),
        padding: padding,
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          if (icon != null) Icon(icon, color: Colors.white),
          if (icon != null) const SizedBox(width: 5),
          Text(
            text,
            style: textStyle ??
                Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w600,
                ),
          ),
        ],
      ),
    );
  }
}
