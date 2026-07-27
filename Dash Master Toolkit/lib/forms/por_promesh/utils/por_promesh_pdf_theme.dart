// lib/forms/por_promesh/utils/por_promesh_pdf_theme.dart
//
// Unicode-capable pw.ThemeData shared by every POR PROMESH PDF export.
// The pdf package falls back to the built-in Helvetica/Helvetica-Bold AFM
// fonts when no theme is supplied, and those only cover the WinAnsi
// subset — French accents render, but punctuation like "—" throws
// "Unable to find a font to draw '—'" and crashes the export. Roboto (via
// PdfGoogleFonts, fetched once and cached by the printing package) covers
// Latin Extended + general punctuation, so it replaces Helvetica everywhere.

import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

Future<pw.ThemeData>? _cachedPdfTheme;

Future<pw.ThemeData> robotoPdfTheme() {
  return _cachedPdfTheme ??= _loadRobotoTheme();
}

Future<pw.ThemeData> _loadRobotoTheme() async {
  final base = await PdfGoogleFonts.robotoRegular();
  final bold = await PdfGoogleFonts.robotoBold();
  final italic = await PdfGoogleFonts.robotoItalic();
  final boldItalic = await PdfGoogleFonts.robotoBoldItalic();
  return pw.ThemeData.withFont(
    base: base,
    bold: bold,
    italic: italic,
    boldItalic: boldItalic,
  );
}
