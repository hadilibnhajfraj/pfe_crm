
import 'package:flutter/material.dart';
import 'package:dash_master_toolkit/theme/styles.dart';

import '../constant/app_color.dart';

class CommonButton extends StatelessWidget {
  final VoidCallback onPressed;
  final String text;
  final double? width;
  final double? height;
  final double? fontSize;
  final double? borderRadius;
  final Color? bgColor;
  final Color? borderColor;
  final Color? textColor;
  final BoxBorder? boxBorder;
  final TextStyle? textStyle;
  final BoxShadow? boxShadow;

  const CommonButton({
    super.key,
    required this.onPressed,
    required this.text,
    this.width,
    this.height,
    this.fontSize,
    this.bgColor,
    this.textColor,
    this.borderColor,
    this.boxBorder,
    this.textStyle,
    this.boxShadow,
    this.borderRadius,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width ?? double.infinity,
      height: height ?? 48.0,
      decoration: BoxDecoration(
          border: Border.all(color: borderColor ?? Colors.transparent),
          borderRadius: BorderRadius.circular(borderRadius ?? 12.0),
          color: bgColor ?? colorPrimary100),
      child: ElevatedButton(
        style: ElevatedButton.styleFrom(
          padding: const EdgeInsets.all(0),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(borderRadius ?? 14.0),
            // side: BorderSide(color:borderColor ?? Colors.transparent,width: 1 )
          ),
          elevation: 4,
          backgroundColor: Colors.transparent,
          foregroundColor: Colors.white,
          shadowColor: Colors.transparent,
        ),
        onPressed: onPressed,
        child: Text(
          text,
          style: textStyle ??
              Theme.of(context).textTheme.bodyLarge?.copyWith(
                  fontWeight: FontWeight.w600,fontSize: fontSize??16,
                  color: textColor ?? Colors.white,
                  fontFamily: Styles.fontFamily),
        ),
      ),
    );
  }
}
