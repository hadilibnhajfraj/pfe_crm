// Hors navigateur (tests, bureau, mobile) : l'enregistrement de fichier n'est
// pas pris en charge par ce module. Voir report_saver_web.dart.
void saveReportFile(List<int> bytes, String filename, String mime) {
  throw UnsupportedError('Le téléchargement de rapports est disponible dans la version web.');
}
