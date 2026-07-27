import 'dart:convert';

class CommercialAction {
  final String id;
  final String typeAction;
  final String? commentaire;
  final String? fileUrl;
  final DateTime? dateAction;

  CommercialAction({
    required this.id,
    required this.typeAction,
    this.commentaire,
    this.fileUrl,
    this.dateAction,
  });

  factory CommercialAction.fromJson(Map<String, dynamic> json) {
    return CommercialAction(
      id: json['id']?.toString() ?? '',
      typeAction: json['typeAction']?.toString() ?? '',
      commentaire: json['commentaire']?.toString(),
      fileUrl: json['fileUrl']?.toString(),
      dateAction: json['dateAction'] != null
          ? DateTime.tryParse(json['dateAction'].toString())
          : null,
    );
  }

  static List<CommercialAction> listFromJson(String body) {
    final data = jsonDecode(body) as List;
    return data.map((e) => CommercialAction.fromJson(e)).toList();
  }
}