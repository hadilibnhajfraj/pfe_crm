// lib/core/theme/app_text_styles.dart
//
// Centralized typography system for Probar Dashboard.
// Uses 'InterTight' (bundled) — avoids GoogleFonts.inter() which can crash
// on Flutter Web due to AssetManifest lookup.
//
// Usage:
//   Text('Dashboard', style: AppTextStyles.pageTitle)
//   Text('Total', style: AppTextStyles.kpiLabel)
//   Text('250', style: AppTextStyles.kpiValue)

import 'package:flutter/material.dart';

const _kFont = 'InterTight';

// ─────────────────────────────────────────────────────────────────────────────
// COLOR PALETTE  (typography colors only)
// ─────────────────────────────────────────────────────────────────────────────
const _kTitlePrimary   = Color(0xFF0F172A);   // page titles
const _kTitleSecondary = Color(0xFF1E293B);   // card / section titles
const _kSubtitle       = Color(0xFF64748B);   // table headers, subtitles
const _kMuted          = Color(0xFF94A3B8);   // sidebar labels, hints

// ─────────────────────────────────────────────────────────────────────────────
// APP TEXT STYLES
// ─────────────────────────────────────────────────────────────────────────────
class AppTextStyles {
  const AppTextStyles._();   // not instantiable

  // ══════════════════════════════════════════════════════════════════════════
  // 1. PAGE TITLE
  //    Dashboard · Project List · Notifications
  //    38 / Bold / #0F172A / letterSpacing -0.5
  // ══════════════════════════════════════════════════════════════════════════
  static const pageTitle = TextStyle(
    fontFamily:    _kFont,
    fontSize:      38,
    fontWeight:    FontWeight.w700,
    color:         _kTitlePrimary,
    letterSpacing: -0.5,
    height:        1.15,
  );

  // ══════════════════════════════════════════════════════════════════════════
  // 2. CARD TITLE
  //    Project Intelligence · Projects by Status · Recent Activities
  //    24 / SemiBold / #1E293B
  // ══════════════════════════════════════════════════════════════════════════
  static const cardTitle = TextStyle(
    fontFamily:  _kFont,
    fontSize:    24,
    fontWeight:  FontWeight.w600,
    color:       _kTitleSecondary,
    letterSpacing: -0.2,
    height:      1.2,
  );

  // ══════════════════════════════════════════════════════════════════════════
  // 3. SIDEBAR GROUP LABEL
  //    PROJECT MANAGEMENT · TOOLS · MY PROJECTS
  //    11 / ExtraBold / #94A3B8 / letterSpacing 1.5 / UPPERCASE
  // ══════════════════════════════════════════════════════════════════════════
  static const sidebarGroupLabel = TextStyle(
    fontFamily:    _kFont,
    fontSize:      11,
    fontWeight:    FontWeight.w700,
    color:         _kMuted,
    letterSpacing: 1.5,
    height:        1.2,
  );

  // ══════════════════════════════════════════════════════════════════════════
  // 4. KPI LABEL
  //    Total Projects · Validated · Validation Rate · Pending
  //    16 / Medium / white (on gradient background)
  // ══════════════════════════════════════════════════════════════════════════
  static const kpiLabel = TextStyle(
    fontFamily:  _kFont,
    fontSize:    16,
    fontWeight:  FontWeight.w500,
    color:       Colors.white,
    height:      1.3,
  );

  // ══════════════════════════════════════════════════════════════════════════
  // 5. KPI VALUE
  //    14 · 100% · 0
  //    42 / ExtraBold / white / letterSpacing -1
  // ══════════════════════════════════════════════════════════════════════════
  static const kpiValue = TextStyle(
    fontFamily:    _kFont,
    fontSize:      42,
    fontWeight:    FontWeight.w800,
    color:         Colors.white,
    letterSpacing: -1,
    height:        1.0,
  );

  // ══════════════════════════════════════════════════════════════════════════
  // 6. TABLE HEADER
  //    Nom · Statut · Date · Surface · Utilisateur
  //    13 / Bold / #64748B / letterSpacing 0.5 / UPPERCASE
  // ══════════════════════════════════════════════════════════════════════════
  static const tableHeader = TextStyle(
    fontFamily:    _kFont,
    fontSize:      13,
    fontWeight:    FontWeight.w700,
    color:         _kSubtitle,
    letterSpacing: 0.5,
    height:        1.2,
  );

  // ══════════════════════════════════════════════════════════════════════════
  // 7. SECTION TITLE  (within a card, smaller than cardTitle)
  //    16 / SemiBold / #1E293B
  // ══════════════════════════════════════════════════════════════════════════
  static const sectionTitle = TextStyle(
    fontFamily:  _kFont,
    fontSize:    16,
    fontWeight:  FontWeight.w600,
    color:       _kTitleSecondary,
    height:      1.3,
  );

  // ══════════════════════════════════════════════════════════════════════════
  // 8. BODY / DEFAULT
  //    14 / Regular / #475569
  // ══════════════════════════════════════════════════════════════════════════
  static const body = TextStyle(
    fontFamily:  _kFont,
    fontSize:    14,
    fontWeight:  FontWeight.w400,
    color:       Color(0xFF475569),
    height:      1.5,
  );

  // ══════════════════════════════════════════════════════════════════════════
  // 9. BODY MUTED  (hints, metadata, timestamps)
  //    13 / Regular / #94A3B8
  // ══════════════════════════════════════════════════════════════════════════
  static const bodyMuted = TextStyle(
    fontFamily:  _kFont,
    fontSize:    13,
    fontWeight:  FontWeight.w400,
    color:       _kMuted,
    height:      1.4,
  );

  // ══════════════════════════════════════════════════════════════════════════
  // 10. BADGE / CHIP LABEL
  //     10 / Bold — color via .copyWith(color: ...)
  // ══════════════════════════════════════════════════════════════════════════
  static const badge = TextStyle(
    fontFamily:  _kFont,
    fontSize:    10,
    fontWeight:  FontWeight.w700,
    height:      1.2,
  );

  // ══════════════════════════════════════════════════════════════════════════
  // 11. BUTTON LABEL
  //     13 / SemiBold / white (on colored background)
  // ══════════════════════════════════════════════════════════════════════════
  static const button = TextStyle(
    fontFamily:  _kFont,
    fontSize:    13,
    fontWeight:  FontWeight.w600,
    color:       Colors.white,
    height:      1.2,
  );

  // ══════════════════════════════════════════════════════════════════════════
  // 12. METRIC (large number, colored by context)
  //     32 / ExtraBold / #0F172A — override color with .copyWith(color: ...)
  // ══════════════════════════════════════════════════════════════════════════
  static const metric = TextStyle(
    fontFamily:    _kFont,
    fontSize:      32,
    fontWeight:    FontWeight.w800,
    color:         _kTitlePrimary,
    letterSpacing: -0.5,
    height:        1.1,
  );

  // ══════════════════════════════════════════════════════════════════════════
  // 13. CHART AXIS LABEL
  //     11 / Medium / #94A3B8
  // ══════════════════════════════════════════════════════════════════════════
  static const chartAxis = TextStyle(
    fontFamily:  _kFont,
    fontSize:    11,
    fontWeight:  FontWeight.w500,
    color:       _kMuted,
    height:      1.2,
  );

  // ══════════════════════════════════════════════════════════════════════════
  // 14. APP BAR TITLE  (inside AppBar / TopBar)
  //     18 / Bold / #0F172A
  // ══════════════════════════════════════════════════════════════════════════
  static const appBarTitle = TextStyle(
    fontFamily:    _kFont,
    fontSize:      18,
    fontWeight:    FontWeight.w700,
    color:         _kTitlePrimary,
    letterSpacing: -0.3,
    height:        1.2,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// QUICK-ACCESS CONSTANTS  (for use in const contexts)
// ─────────────────────────────────────────────────────────────────────────────

/// Padding applied below a page title (24 px bottom gap).
const kPageTitlePadding = EdgeInsets.only(bottom: 24);

/// Standard card title padding: left 24, top 24, bottom 16.
const kCardTitlePadding = EdgeInsets.fromLTRB(24, 24, 24, 16);
