import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../model/commercial_contact_models.dart';
import '../../../services/commercial_contact_api.dart';
import '../../../providers/auth_service.dart';

class CommercialContactCreateController extends GetxController {
  final loading = false.obs;

  final typeClient = "Tuteur".obs;
  final statut = "user_injoignable".obs;

  final nomSocieteCtrl = TextEditingController();
  final nomCtrl = TextEditingController();
  final prenomCtrl = TextEditingController();
  final localisationCtrl = TextEditingController();
  final telephoneCtrl = TextEditingController();
  final messageCtrl = TextEditingController();

  final nbAppelsCtrl = TextEditingController(text: "0");
  final sujetDiscussionCtrl = TextEditingController();
  final emailCtrl = TextEditingController();
  final matriculeFiscaleCtrl = TextEditingController();

  var pipelineStage = "Prospect".obs;

  final dateAppelCtrl = TextEditingController();
  DateTime? dateAppel;

  final commentaireRelanceCtrl = TextEditingController();
  final dateRelanceCtrl = TextEditingController();
  final heureRelanceCtrl = TextEditingController();

  final produits = <CommercialProductInput>[].obs;

  final userNom = "".obs;

  final projects = <CommercialProjectInput>[].obs;

  // ================= INIT =================
  @override
  void onInit() {
    super.onInit();

    final auth = Get.find<AuthService>();
    final savedUser = auth.getUserName();

    userNom.value = (savedUser != null && savedUser.isNotEmpty)
        ? savedUser
        : "unknown";

    // init produit
    produits.add(
      CommercialProductInput(
        produit: "PROBAR",
        qte: 1,
      ),
    );

    // init project
    projects.add(
      CommercialProjectInput(
        createdBy: userNom.value,
      ),
    );

    // sync projects avec user
    ever(userNom, (value) {
      for (var p in projects) {
        p.createdBy = value;
      }
      projects.refresh();
    });
  }

  // ================= PRODUITS =================
  void addProduitRow() {
    produits.add(
      CommercialProductInput(produit: "PROBAR", qte: 1),
    );
    produits.refresh();
  }

  void removeProduitRow(int index) {
    produits.removeAt(index);

    if (produits.isEmpty) {
      produits.add(CommercialProductInput(produit: "PROBAR", qte: 1));
    }

    produits.refresh();
  }

  // ================= PROJECTS =================
  void addProjectRow() {
    projects.add(
      CommercialProjectInput(createdBy: userNom.value),
    );
    projects.refresh();
  }

  void removeProjectRow(int index) {
    projects.removeAt(index);

    if (projects.isEmpty) {
      projects.add(CommercialProjectInput(createdBy: userNom.value));
    }

    projects.refresh();
  }

  // ================= RELANCE =================
  bool get canScheduleRelance =>
      statut.value == "ok" || statut.value == "rappeler_plus_tard";

  // ================= SUBMIT =================
  Future<bool> submit() async {
    final nom = nomCtrl.text.trim();
    final prenom = prenomCtrl.text.trim();
    final tel = telephoneCtrl.text.trim();
    final matricule = matriculeFiscaleCtrl.text.trim();
    final email = emailCtrl.text.trim();
    if (nom.isEmpty && prenom.isEmpty && tel.isEmpty && emailCtrl.text.trim().isEmpty) {
  Get.snackbar("Erreur", "Remplis au moins Nom, Téléphone ou Email");
  return false;
}

    final cleanedProduits = produits.map((p) {
      return CommercialProductInput(
        produit: p.produit.trim().isEmpty ? "PROBAR" : p.produit.trim(),
        qte: p.qte <= 0 ? 1 : p.qte,
      );
    }).toList();

    CommercialRelanceInput? relance;

    if (canScheduleRelance && dateRelanceCtrl.text.trim().isNotEmpty) {
      relance = CommercialRelanceInput(
        dateRelance: dateRelanceCtrl.text.trim(),
        heureRelance: heureRelanceCtrl.text.trim().isEmpty
            ? null
            : heureRelanceCtrl.text.trim(),
        commentaire: commentaireRelanceCtrl.text.trim(),
        nbAppels: int.tryParse(nbAppelsCtrl.text.trim()) ?? 0,
        sujetDiscussion: sujetDiscussionCtrl.text.trim(),
      );
    }

    final dto = CommercialContactCreateDto(
      typeClient: typeClient.value,
      statut: statut.value,
      nomSociete: nomSocieteCtrl.text,
      nom: nomCtrl.text,
      prenom: prenomCtrl.text,
      localisation: localisationCtrl.text,
      telephone: telephoneCtrl.text,
      message: messageCtrl.text,
      nbAppels: int.tryParse(nbAppelsCtrl.text.trim()) ?? 0,
      matriculeFiscale: matricule.isEmpty ? null : matricule,
      sujetDiscussion: sujetDiscussionCtrl.text.trim(),
      produits: cleanedProduits,
      projects: projects,
      relance: relance,
      userNom: userNom.value,
       // 🔥 AJOUT ICI
  email: email.isEmpty ? null : email,
    );

    loading.value = true;

    try {
      await CommercialContactApi.instance.createContact(dto);
      return true;
    } catch (e) {
      debugPrint("CREATE_CONTACT_ERROR: $e");
      return false;
    } finally {
      loading.value = false;
    }
  }

  // ================= RESET =================
  void resetForm() {
    typeClient.value = "Tuteur";
    statut.value = "user_injoignable";

    nomSocieteCtrl.clear();
    nomCtrl.clear();
    prenomCtrl.clear();
    localisationCtrl.clear();
    telephoneCtrl.clear();
    messageCtrl.clear();

    nbAppelsCtrl.text = "0";
    sujetDiscussionCtrl.clear();

    commentaireRelanceCtrl.clear();
    dateRelanceCtrl.clear();
    heureRelanceCtrl.clear();

    produits.clear();
    produits.add(CommercialProductInput(produit: "PROBAR", qte: 1));

    projects.clear();
    projects.add(CommercialProjectInput(createdBy: userNom.value));
  }

  // ================= DISPOSE =================
  @override
  void onClose() {
    nomSocieteCtrl.dispose();
    nomCtrl.dispose();
    prenomCtrl.dispose();
    localisationCtrl.dispose();
    telephoneCtrl.dispose();
    messageCtrl.dispose();

    nbAppelsCtrl.dispose();
    sujetDiscussionCtrl.dispose();

    commentaireRelanceCtrl.dispose();
    dateRelanceCtrl.dispose();
    heureRelanceCtrl.dispose();

    super.onClose();
  }
}