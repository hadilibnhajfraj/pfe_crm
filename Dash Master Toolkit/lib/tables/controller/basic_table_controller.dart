import 'package:dash_master_toolkit/tables/table_imports.dart';

class BasicTableController extends GetxController {
  var users = <TableUserModel>[].obs;
  final RxInt sortColumnIndex = 0.obs;
  final RxBool isAscending = true.obs;


  @override
  void onInit() {
    super.onInit();
    loadUsers();
  }

  void loadUsers() {
    users.value = [
      TableUserModel(
        name: "Olivia Rhye",
        projectName: "Xtreme admin",
        userAvatars: [profileIcon1, profileIcon2],
        status: "Active",
      ),
      TableUserModel(
        name: "Barbara Steele",
        projectName: "Adminpro admin",
        userAvatars: [profileIcon3, profileIcon4, profileIcon5],
        status: "Cancel",
      ),
      TableUserModel(
        name: "Leonard Gordon",
        projectName: "Monster admin",
        userAvatars: [
          profileIcon3,
          profileIcon6,
        ],
        status: "Active",
      ),
      TableUserModel(
        name: "Evelyn Pope",
        projectName: "Materialpro admin",
        userAvatars: [profileIcon3, profileIcon4, profileIcon5],
        status: "Pending",
      ),
      TableUserModel(
        name: "Tommy Garza",
        projectName: "Elegant admin",
        userAvatars: [profileIcon3, profileIcon4, profileIcon5],
        status: "Cancel",
      ),
      TableUserModel(
        name: "Isabel Vasquez",
        projectName: "Modernize admin",
        userAvatars: [profileIcon3, profileIcon4, profileIcon5],
        status: "pending",
      ),
      // Add more users similarly...
    ];
  }

  final invoices = <InvoiceModel>[
    InvoiceModel(
      invoiceId: 'INV-3066',
      status: 'Paid',
      customerName: 'Olivia Rhye',
      customerEmail: 'olivia@ui.com',
      avatar: 'https://i.ibb.co/r2CNfH9d/user-4-18ed1a2b.jpg',
      progress: 60,
    ),
    InvoiceModel(
      invoiceId: 'INV-3067',
      status: 'Cancelled',
      customerName: 'Barbara Steele',
      customerEmail: 'steele@ui.com',
      avatar: 'https://i.ibb.co/Q3LWwh4g/user-5-111bbb24.jpg',
      progress: 45,
    ),
    InvoiceModel(
      invoiceId: 'INV-3068',
      status: 'paid',
      customerName: 'Leonard Gordon',
      customerEmail: 'olivia@ui.com',
      avatar: 'https://i.ibb.co/9HcvS6L3/user-10-0e467bdd.jpg',
      progress: 30,
    ),
    InvoiceModel(
      invoiceId: 'INV-3069',
      status: 'refunded',
      customerName: 'Evelyn Pope',
      customerEmail: 'steele@ui.com',
      avatar: 'https://i.ibb.co/5WcDdXQJ/user-12-63176adc.jpg',
      progress: 90,
    ),
    InvoiceModel(
      invoiceId: 'INV-3070',
      status: 'Cancelled',
      customerName: 'Tommy Garza',
      customerEmail: 'steele@ui.com',
      avatar: 'https://i.ibb.co/9HcvS6L3/user-10-0e467bdd.jpg',
      progress: 87,
    ),
    InvoiceModel(
      invoiceId: 'INV-3071',
      status: 'refunded',
      customerName: 'Isabel Vasquez',
      customerEmail: 'steele@ui.com',
      avatar: 'https://i.ibb.co/9HcvS6L3/user-10-0e467bdd.jpg',
      progress: 32,
    ),
    // Add more items...
  ].obs;
}
