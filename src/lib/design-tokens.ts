/**
 * Design system tokens for programmatic use.
 * CSS custom properties in index.css are the source of truth for theming.
 * These constants are for non-CSS contexts (e.g. chart colors, conditional logic).
 */

export const COLORS = {
  primary: '#525EA2',
  primarySoft: '#EEF1F8',
  background: '#F6F7FB',
  surface: '#FFFFFF',
  surfaceSecondary: '#F8FAFC',
  textPrimary: '#1F2937',
  textSecondary: '#6B7280',
  textMuted: '#94A3B8',
  borderSoft: '#E5E7EB',
  success: '#238D7E',
  warning: '#F6B248',
  danger: '#ED8735',
  neutral: '#736464',
} as const;

export const RADIUS = {
  xs: '10px',
  sm: '12px',
  md: '16px',
  lg: '24px',
  xl: '32px',
  full: '999px',
} as const;

export const SPACING = {
  /** Base unit */
  base: 8,
  micro: 4,
  mobilePadding: 16,
  desktopPadding: 24,
  cardPaddingMobile: 16,
  cardPaddingDesktop: 20,
  sectionGap: 12,
  layoutGap: 20,
} as const;
