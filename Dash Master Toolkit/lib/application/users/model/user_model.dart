class UserModel {
  final String id;
  final String name;
  final String designation;
  final String department;
  final String email;
  final String phone;
  final String status;

  // ✅ avatar backend
  final String? avatarUrl;

  // ✅ image fallback UI (local)
  final String imageUrl;

  const UserModel({
    required this.id,
    required this.name,
    required this.designation,
    required this.department,
    required this.email,
    required this.phone,
    required this.status,
    required this.imageUrl,
    this.avatarUrl,
  });

  bool get isActive => status.toLowerCase() == "active";

  // ✅ image finale affichée
  String get displayImage {
    if (avatarUrl != null && avatarUrl!.isNotEmpty) {
      // TODO: Update to use ApiConfig when displayImage is called from UI context
      return "http://localhost:4000$avatarUrl";
    }
    return imageUrl;
  }

  // ================= COPY =================
  UserModel copyWith({
    String? status,
    String? avatarUrl,
    String? imageUrl,
  }) {
    return UserModel(
      id: id,
      name: name,
      designation: designation,
      department: department,
      email: email,
      phone: phone,
      status: status ?? this.status,
      avatarUrl: avatarUrl ?? this.avatarUrl,
      imageUrl: imageUrl ?? this.imageUrl,
    );
  }

  // ================= FROM JSON =================
  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      id: json["id"] ?? "",
      name: json["name"] ?? "",
      designation: json["designation"] ?? json["role"] ?? "",
      department: json["department"] ?? "",
      email: json["email"] ?? "",
      phone: json["phone"] ?? "",
      status: json["status"] ?? "inactive",
      avatarUrl: json["avatarUrl"],

      // fallback image
      imageUrl: "assets/images/profile.png",
    );
  }
}