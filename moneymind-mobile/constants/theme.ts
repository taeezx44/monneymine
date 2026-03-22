// constants/theme.ts
// ─────────────────────────────────────────────────────────────
// Design token system: dark financial terminal aesthetic
// Consistent with the Next.js web dashboard
// ─────────────────────────────────────────────────────────────

import { Platform } from 'react-native'

// ── Color palette ─────────────────────────────────────────────
export const Colors = {
  // Backgrounds
  bg:       '#0a0a0b',
  bg2:      '#111113',
  bg3:      '#0c0c0e',
  bgCard:   '#161618',
  bgInput:  '#1a1a1d',

  // Borders
  border:       'rgba(255,255,255,0.07)',
  borderMd:     'rgba(255,255,255,0.11)',
  borderStrong: 'rgba(255,255,255,0.18)',

  // Text
  text:    '#e8e6e0',
  text2:   '#c8c6c0',
  text3:   '#888882',
  muted:   '#555550',
  faint:   '#333330',

  // Accents
  green:      '#84cc16',
  greenLight: '#a3e635',
  greenBg:    'rgba(132,204,22,0.1)',
  greenBorder:'rgba(132,204,22,0.25)',

  red:       '#f87171',
  redBg:     'rgba(248,113,113,0.1)',

  blue:      '#60a5fa',
  blueBg:    'rgba(96,165,250,0.1)',

  amber:     '#fbbf24',
  amberBg:   'rgba(251,191,36,0.1)',

  teal:      '#34d399',
  tealBg:    'rgba(52,211,153,0.1)',

  purple:    '#a78bfa',

  // Category palette
  catFood:    '#f97316',
  catTravel:  '#60a5fa',
  catShop:    '#e879f9',
  catFun:     '#a78bfa',
  catHealth:  '#34d399',
  catBills:   '#94a3b8',
  catSalary:  '#84cc16',
} as const

// ── Typography ────────────────────────────────────────────────
export const Fonts = {
  // Expo Google Fonts or system fallback
  display: Platform.select({ ios: 'DMSerifDisplay', android: 'DMSerifDisplay', default: 'serif' }),
  mono:    Platform.select({ ios: 'GeistMono',      android: 'GeistMono',      default: 'monospace' }),
  sans:    Platform.select({ ios: 'Geist',          android: 'Geist',          default: 'System' }),
} as const

export const FontSize = {
  xs:  11,
  sm:  12,
  md:  14,
  lg:  16,
  xl:  18,
  '2xl': 22,
  '3xl': 28,
  '4xl': 36,
} as const

export const FontWeight = {
  light:   '300' as const,
  regular: '400' as const,
  medium:  '500' as const,
  semibold:'600' as const,
}

// ── Spacing ───────────────────────────────────────────────────
export const Spacing = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
} as const

// ── Border radius ─────────────────────────────────────────────
export const Radius = {
  sm:   6,
  md:   10,
  lg:   14,
  xl:   18,
  full: 999,
} as const

// ── Shadows ───────────────────────────────────────────────────
export const Shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  green: {
    shadowColor: '#84cc16',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
} as const

// ── Shared card style ─────────────────────────────────────────
export const cardStyle = {
  backgroundColor: Colors.bg2,
  borderRadius:    Radius.lg,
  borderWidth:     0.5,
  borderColor:     Colors.border,
  padding:         Spacing['2xl'],
} as const

// ── Tab bar height (for bottom padding) ──────────────────────
export const TAB_BAR_HEIGHT = 84
