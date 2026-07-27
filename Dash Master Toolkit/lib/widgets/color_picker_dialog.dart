import 'package:flutter/material.dart';
import 'package:flutter_colorpicker/flutter_colorpicker.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';
import 'package:dash_master_toolkit/widgets/common_button.dart';

class ColorPickerDialog {
  static Future<Color?> show(BuildContext context, Color initialColor,ThemeData theme) async {
    Color pickerColor = initialColor;


    return showDialog<Color>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title:  Text(AppLocalizations.of(context).translate('Pick a color!'),style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),),
          content: SingleChildScrollView(
            child: ColorPicker(
              pickerColor: pickerColor,
              onColorChanged: (color) {
                pickerColor = color;
              },
            ),
          ),
          actions: <Widget>[
            CommonButton(
              height: 40,
              width: 100,
              borderRadius: 5,
              text: AppLocalizations.of(context).translate('gotIt'),
              onPressed: () {
                Navigator.of(context).pop(pickerColor);
              },
            ),
          ],
        );
      },
    );
  }
}
