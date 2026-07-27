class InvoiceModel {
  final String invoiceId;
  final String status;
  final String customerName;
  final String customerEmail;
  final String avatar;
  final int progress;

  InvoiceModel({
    required this.invoiceId,
    required this.status,
    required this.customerName,
    required this.customerEmail,
    required this.avatar,
    required this.progress,
  });
}
