class OrderModel {
  final String id;                // => projectId (UUID) ou code affichage
  final DateTime date;            // => dateDemarrage
  final String customerName;      // => nomProjet
  final String customerEmail;     // => username (ou email)
  final String customerAvatarUrl; // => image placeholder
  final String paymentStatus;     // => validationStatut (Validé / Non validé)
  final String orderStatus;       // => statut (Terminé / En cours / Préparation)
  final String paymentMethod;     // => permission (owner/editor/viewer)
  final String paymentLast4;      // => typeProjet ou surface

  bool isSelected = false;

  OrderModel({
    required this.id,
    required this.date,
    required this.customerName,
    required this.customerEmail,
    required this.customerAvatarUrl,
    required this.paymentStatus,
    required this.orderStatus,
    required this.paymentMethod,
    required this.paymentLast4,
    required this.isSelected,
  });
}
