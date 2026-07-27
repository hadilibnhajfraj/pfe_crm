// ignore_for_file: constant_identifier_names

enum BreakpointName {
  /// XS(start: 0, end: 576) Mobile Size
  XS(start: 0, end: 576),

  ///SM(start: 577, end: 768) Tablet Size
  SM(start: 577, end: 904),

  /// MD(start: 769, end: 992) Large Tablet Size
  MD(start: 905, end: 1239),

  /// LG(start: 993, end: 1200) Laptop Size
  LG(start: 1240, end: 1439),

  /// XL(start: 1201, end: 1400) Squared Size
  XL(start: 1440, end: double.infinity);

  /// XXL(start: 1401, end: double.infinity) Desktop & Large Size
  // XXL(start: 1401, end: double.infinity);

  final double start;
  final double end;

  const BreakpointName({required this.start, required this.end});
}
