import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import 'package:dash_master_toolkit/constant/app_color.dart';
import 'package:dash_master_toolkit/constant/app_strings.dart';
import '../../../constant/app_images.dart';

// Design partagé par les 3 pages d'authentification (Login / Créer un
// compte / Mot de passe oublié) — la page Login est la référence, ces
// widgets garantissent qu'aucune différence visuelle ne puisse exister
// entre les trois écrans (même fond, carte, header, footer, champs,
// bouton), plutôt que de dupliquer le même code trois fois.

const Color kAuthViolet = Color(0xFF6366F1);
const Color kAuthFieldGrey = Color(0xFF9CA3AF);

/// Fond chantier flouté/assombri + dégradé bleu → violet, carte blanche
/// centrée (largeur/padding responsives) avec animation d'entrée fade+scale,
/// header (logo Probar) et footer (Version / copyright) communs. Chaque page
/// ne fournit que son contenu spécifique (titre, champs, bouton, lien) via
/// [child].
class AuthScaffold extends StatefulWidget {
  final Widget child;
  const AuthScaffold({super.key, required this.child});

  @override
  State<AuthScaffold> createState() => _AuthScaffoldState();
}

class _AuthScaffoldState extends State<AuthScaffold>
    with SingleTickerProviderStateMixin {
  late final AnimationController _entryController;
  late final Animation<double> _fadeAnim;
  late final Animation<double> _scaleAnim;

  @override
  void initState() {
    super.initState();
    _entryController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 650),
    );
    _fadeAnim = CurvedAnimation(parent: _entryController, curve: Curves.easeOut);
    _scaleAnim = Tween<double>(begin: 0.94, end: 1.0).animate(
      CurvedAnimation(parent: _entryController, curve: Curves.easeOutCubic),
    );
    _entryController.forward();
  }

  @override
  void dispose() {
    _entryController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final screenWidth = MediaQuery.sizeOf(context).width;
    final isMobile = screenWidth < 600;
    final cardWidth = isMobile ? screenWidth * 0.95 : 480.0;
    final cardPadding = isMobile ? 24.0 : 40.0;

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: SizedBox.expand(
        child: Stack(
          children: [
            // Fond chantier — adouci (léger blur + désaturation).
            Positioned.fill(
              child: ImageFiltered(
                imageFilter: ImageFilter.blur(sigmaX: 6, sigmaY: 6),
                child: ColorFiltered(
                  colorFilter:
                      ColorFilter.mode(Colors.black.withOpacity(0.18), BlendMode.darken),
                  child: Image.asset(
                    "assets/images/login_bg.png",
                    fit: BoxFit.cover,
                  ),
                ),
              ),
            ),

            // Overlay sombre + dégradé bleu → violet (identité Probar).
            Positioned.fill(
              child: Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      const Color(0xFF0B1220).withOpacity(0.72),
                      colorPrimary100.withOpacity(0.42),
                      kAuthViolet.withOpacity(0.55),
                    ],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                ),
              ),
            ),

            // Carte de connexion.
            Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(vertical: 24),
                child: FadeTransition(
                  opacity: _fadeAnim,
                  child: ScaleTransition(
                    scale: _scaleAnim,
                    child: Container(
                      width: cardWidth,
                      padding: EdgeInsets.all(cardPadding),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(20),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.22),
                            blurRadius: 40,
                            offset: const Offset(0, 20),
                          ),
                        ],
                      ),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const AuthHeader(),
                          const SizedBox(height: 40),
                          widget.child,
                          const SizedBox(height: 32),
                          const AuthFooter(),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Logo Probar + nom de l'app + "Project Management Platform", centré.
class AuthHeader extends StatelessWidget {
  const AuthHeader({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          width: 64,
          height: 64,
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [colorPrimary100, kAuthViolet],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(18),
            boxShadow: [
              BoxShadow(
                color: kAuthViolet.withOpacity(0.35),
                blurRadius: 20,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: SvgPicture.asset(
            logoIcon,
            colorFilter: const ColorFilter.mode(Colors.white, BlendMode.srcIn),
          ),
        ),
        const SizedBox(height: 16),
        const Text(
          appName,
          style: TextStyle(
            fontSize: 22,
            fontWeight: FontWeight.w800,
            color: Color(0xFF0F172A),
            letterSpacing: -0.3,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          'Project Management Platform',
          style: TextStyle(
            fontSize: 12.5,
            fontWeight: FontWeight.w600,
            color: Colors.grey.shade500,
            letterSpacing: 0.2,
          ),
        ),
      ],
    );
  }
}

/// "Version 2.0" / "© 2026 CBI Tunisia", centré.
class AuthFooter extends StatelessWidget {
  const AuthFooter({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          'Version 2.0',
          style: TextStyle(
            fontSize: 11.5,
            fontWeight: FontWeight.w500,
            color: Colors.grey.shade400,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          '© 2026 CBI Tunisia',
          style: TextStyle(fontSize: 11.5, color: Colors.grey.shade400),
        ),
      ],
    );
  }
}

/// Titre + sous-titre de chaque page ("Bienvenue" / "Créer un compte" /
/// "Mot de passe oublié"), même typographie partout.
class AuthTitle extends StatelessWidget {
  final String title;
  final String subtitle;
  const AuthTitle({super.key, required this.title, required this.subtitle});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          title,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 28,
            fontWeight: FontWeight.w800,
            color: Color(0xFF0F172A),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          subtitle,
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 13.5, color: Colors.grey.shade500),
        ),
      ],
    );
  }
}

/// Champ de saisie commun : icône grise au repos / bleue au focus,
/// placeholder gris clair qui disparaît à la saisie, bordure bleue au focus.
class AuthTextField extends StatelessWidget {
  final TextEditingController controller;
  final FocusNode focusNode;
  final String placeholder;
  final IconData icon;
  final bool isFocused;
  final bool isPassword;
  final Widget? suffixIcon;
  final TextInputAction textInputAction;
  final void Function(String)? onFieldSubmitted;
  final void Function(String)? onChanged;
  final String? Function(String?)? validator;
  final AutovalidateMode? autovalidateMode;
  final TextInputType? keyboardType;

  const AuthTextField({
    super.key,
    required this.controller,
    required this.focusNode,
    required this.placeholder,
    required this.icon,
    required this.isFocused,
    this.isPassword = false,
    this.suffixIcon,
    this.textInputAction = TextInputAction.next,
    this.onFieldSubmitted,
    this.onChanged,
    this.validator,
    this.autovalidateMode,
    this.keyboardType,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: TextFormField(
        controller: controller,
        focusNode: focusNode,
        obscureText: isPassword,
        textInputAction: textInputAction,
        keyboardType: keyboardType,
        onFieldSubmitted: onFieldSubmitted,
        onChanged: onChanged,
        validator: validator,
        autovalidateMode: autovalidateMode,
        style: const TextStyle(color: Color(0xFF0F172A), fontSize: 15.5),
        decoration: InputDecoration(
          hintText: placeholder,
          hintStyle: const TextStyle(
            color: kAuthFieldGrey,
            fontSize: 15.5,
            fontWeight: FontWeight.w400,
          ),
          prefixIcon: Icon(
            icon,
            size: 20,
            color: isFocused ? colorPrimary100 : kAuthFieldGrey,
          ),
          suffixIcon: suffixIcon,
          filled: true,
          fillColor: const Color(0xFFF8FAFC),
          contentPadding:
              const EdgeInsets.symmetric(vertical: 16, horizontal: 16),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: BorderSide.none,
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: Color(0xFFE2E8F0), width: 1.3),
          ),
          // L'InputDecorator de Flutter anime déjà en douceur la transition
          // enabledBorder → focusedBorder (animation focus).
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: BorderSide(color: colorPrimary100, width: 1.8),
          ),
          errorBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: BorderSide(color: Colors.red.shade300, width: 1.3),
          ),
          focusedErrorBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: BorderSide(color: Colors.red.shade400, width: 1.8),
          ),
        ),
      ),
    );
  }
}

/// Bouton dégradé bleu → violet avec élévation au survol — même
/// comportement/apparence sur les 3 pages.
class AuthGradientButton extends StatefulWidget {
  final String label;
  final VoidCallback onPressed;

  const AuthGradientButton({super.key, required this.label, required this.onPressed});

  @override
  State<AuthGradientButton> createState() => _AuthGradientButtonState();
}

class _AuthGradientButtonState extends State<AuthGradientButton> {
  bool _hover = false;
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final elevated = _hover && !_pressed;

    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTapDown: (_) => setState(() => _pressed = true),
        onTapUp: (_) => setState(() => _pressed = false),
        onTapCancel: () => setState(() => _pressed = false),
        onTap: widget.onPressed,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOut,
          transform: Matrix4.translationValues(0, elevated ? -2 : 0, 0),
          width: double.infinity,
          height: 52,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [colorPrimary100, kAuthViolet],
              begin: Alignment.centerLeft,
              end: Alignment.centerRight,
            ),
            borderRadius: BorderRadius.circular(14),
            boxShadow: [
              BoxShadow(
                color: kAuthViolet.withOpacity(elevated ? 0.45 : 0.28),
                blurRadius: elevated ? 24 : 14,
                offset: Offset(0, elevated ? 12 : 6),
              ),
            ],
          ),
          child: Text(
            widget.label,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w700,
              fontSize: 15.5,
              letterSpacing: 0.2,
            ),
          ),
        ),
      ),
    );
  }
}

/// Ligne case à cocher ("Se souvenir de moi" / "J'accepte les conditions
/// d'utilisation") — même style partout.
class AuthCheckboxRow extends StatelessWidget {
  final bool value;
  final ValueChanged<bool?> onChanged;
  final String label;

  const AuthCheckboxRow({
    super.key,
    required this.value,
    required this.onChanged,
    required this.label,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        SizedBox(
          width: 22,
          height: 22,
          child: Checkbox(
            value: value,
            onChanged: onChanged,
            activeColor: colorPrimary100,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(5)),
          ),
        ),
        const SizedBox(width: 8),
        Text(
          label,
          style: const TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w500,
            color: Color(0xFF475569),
          ),
        ),
      ],
    );
  }
}

/// Lien de bas de page ("Pas encore de compte ? Créer un compte" / "Vous
/// avez déjà un compte ? Se connecter" / "Retour à la connexion").
class AuthBottomLink extends StatelessWidget {
  final String prefix;
  final String actionText;
  final VoidCallback onTap;

  const AuthBottomLink({
    super.key,
    this.prefix = '',
    required this.actionText,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return TextButton(
      onPressed: onTap,
      child: RichText(
        text: TextSpan(
          style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
          children: [
            if (prefix.isNotEmpty) TextSpan(text: '$prefix '),
            TextSpan(
              text: actionText,
              style: TextStyle(color: colorPrimary100, fontWeight: FontWeight.w700),
            ),
          ],
        ),
      ),
    );
  }
}
