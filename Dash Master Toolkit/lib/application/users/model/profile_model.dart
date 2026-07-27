import '../users_imports.dart';

class ProfileModel {
  final String name;
  final String designation;
  final String email;
  final String birthday;
  final String phone;
  final String country;
  final String state;
  final String address;

final List occupationType;
final List activities;
final List experiences;
  final String department;
  final String location;
  final String about;


  // ✅ AJOUT IMPORTANT
  final String? avatarUrl;

  ProfileModel({
    required this.name,
    required this.designation,
    required this.email,
    required this.birthday,
    required this.phone,
    required this.country,
    required this.state,
    required this.address,
    required this.occupationType,
    required this.department,
    required this.location,
    required this.about,
    required this.activities,
    required this.experiences,

    // ✅ AJOUT
    this.avatarUrl,
  });

  // ================= COPY =================
  ProfileModel copyWith({
    String? name,
    String? designation,
    String? email,
    String? birthday,
    String? phone,
    String? country,
    String? state,
    String? address,
    String? about,
    String? avatarUrl,
  }) {
    return ProfileModel(
      name: name ?? this.name,
      designation: designation ?? this.designation,
      email: email ?? this.email,
      birthday: birthday ?? this.birthday,
      phone: phone ?? this.phone,
      country: country ?? this.country,
      state: state ?? this.state,
      address: address ?? this.address,
      occupationType: occupationType,
      department: department,
      location: location,
      about: about ?? this.about,
      activities: activities,
      experiences: experiences,

      // ✅ IMPORTANT
      avatarUrl: avatarUrl ?? this.avatarUrl,
    );
  }

  @override
  String toString() => 'ProfileModel(name: $name, email: $email, phone: $phone, '
      'country: $country, birthday: $birthday, address: $address, avatarUrl: $avatarUrl)';
}