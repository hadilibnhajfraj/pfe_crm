class ClientModel {
  final int? id;
  final String? code;
  final String? raisonSociale;
  final String? adresse;
  final String? codePostal;
  final String? region;
  final String? creeLe;
  final String? regime;
  final String? matriculeFiscal;
  final String? identifiantUnique;
  final String? contact;
  final String? derniereFacturation;

  ClientModel({
    this.id,
    this.code,
    this.raisonSociale,
    this.adresse,
    this.codePostal,
    this.region,
    this.creeLe,
    this.regime,
    this.matriculeFiscal,
    this.identifiantUnique,
    this.contact,
    this.derniereFacturation,
  });

  factory ClientModel.fromJson(Map<String, dynamic> json) {
    return ClientModel(
      id: json['id'] is int ? json['id'] : int.tryParse('${json['id']}'),
      code: json['code']?.toString(),
      raisonSociale: json['raisonSociale']?.toString(),
      adresse: json['adresse']?.toString(),
      codePostal: json['codePostal']?.toString(),
      region: json['region']?.toString(),
      creeLe: json['creeLe']?.toString(),
      regime: json['regime']?.toString(),
      matriculeFiscal: json['matriculeFiscal']?.toString(),
      identifiantUnique: json['identifiantUnique']?.toString(),
      contact: json['contact']?.toString(),
      derniereFacturation: json['derniereFacturation']?.toString(),
    );
  }
}