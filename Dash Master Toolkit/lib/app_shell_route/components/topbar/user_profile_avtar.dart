import '../common_imports.dart';
import 'package:dash_master_toolkit/providers/auth_service.dart';

class UserProfileAvatar extends StatelessWidget {
  const UserProfileAvatar({super.key});

  static const String kSigninPath = '/authentication/signin';
  static const String kProfilePath = '/users/user_profile';
  static const String kSettingsPath = '/application/settings';

  void _changerCommercial(BuildContext context) {
    AuthService().clearCommercialSelection();
    debugPrint('[Menu] Commercial effacé → redirection sélection');
    context.go(MyRoute.commercialSelectionScreen);
  }

  Future<void> _logout(BuildContext context) async {
    debugPrint('LOGOUT CLICKED');

    // Nettoyage complet de la session via AuthService :
    // isLoggedIn=false, accessToken, tokenExpiryMs, userId, userEmail, userRole
    // + AuthStorage (secure storage) + ApiClient token header
    await AuthService().logout();

    debugPrint('TOKEN REMOVED');
    debugPrint('REDIRECT TO LOGIN');

    if (context.mounted) {
      context.go(kSigninPath);
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<int>(
      onSelected: (value) async {
        switch (value) {
          case 1:
            context.go(kProfilePath);
            break;
          case 2:
            context.go(kSettingsPath);
            break;
          case 4:
            _changerCommercial(context);
            break;
          case 3:
            await _logout(context);
            break;
        }
      },
      itemBuilder: (context) {
        final isCommercial =
            AuthService().userRole?.toLowerCase().trim() == 'commercial';
        return [
          const PopupMenuItem(
            value: 1,
            child: Row(
              children: [
                Icon(Icons.person),
                SizedBox(width: 10),
                Text("Profile"),
              ],
            ),
          ),
          const PopupMenuItem(
            value: 2,
            child: Row(
              children: [
                Icon(Icons.settings),
                SizedBox(width: 10),
                Text("Settings"),
              ],
            ),
          ),
          if (isCommercial)
            const PopupMenuItem(
              value: 4,
              child: Row(
                children: [
                  Icon(Icons.swap_horiz_rounded, color: Colors.blueAccent),
                  SizedBox(width: 10),
                  Text(
                    "Changer de commercial",
                    style: TextStyle(color: Colors.blueAccent),
                  ),
                ],
              ),
            ),
          const PopupMenuItem(
            value: 3,
            child: Row(
              children: [
                Icon(Icons.logout, color: Colors.red),
                SizedBox(width: 10),
                Text("Logout", style: TextStyle(color: Colors.red)),
              ],
            ),
          ),
        ];
      },
      position: PopupMenuPosition.under,
      child: CircleAvatar(
        radius: 20,
        backgroundImage: AssetImage(profileIcon),
      ),
    );
  }
}
