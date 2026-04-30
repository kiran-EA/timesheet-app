// ─────────────────────────────────────────────────────────────────────────────
// Calibrated theme — premium, low-saturation, single-accent system.
// "AI lila" purple/blue gradients eliminated. Sapphire accent only.
// To revert to dark mode change the last line to: `export const t = themes.dark;`
// ─────────────────────────────────────────────────────────────────────────────

const accent = {
  /** Single sapphire accent — saturation < 80%. */
  brand:        '#1d4ed8',
  brandHover:   '#1e40af',
  brandSoft:    'rgba(29, 78, 216, 0.08)',
  brandRing:    'rgba(29, 78, 216, 0.32)',
  /** Tonal range, used for tasteful tint without "AI gradient" tells. */
  brandGradient: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
};

const themes = {
  dark: {
    pageBg:       '#09090b',
    headerBg:     'rgba(24, 24, 27, 0.78)',
    cardBg:       '#18181b',
    cardBg2:      '#101013',
    tableHead:    '#101013',
    border:       '1px solid #27272a',
    borderColor:  '#27272a',
    border2:      '#3f3f46',
    text:         '#fafafa',
    textMuted:    '#a1a1aa',
    textSubtle:   '#71717a',
    textBody:     '#e4e4e7',
    textHeader:   '#fafafa',
    inputBg:      '#101013',
    inputBorder:  '#27272a',
    modalBg:      'rgba(0, 0, 0, 0.55)',
    statGrad:     'linear-gradient(135deg,#18181b 0%,#101013 100%)',
    accent:       accent.brand,
    accentHover:  accent.brandHover,
    accentSoft:   accent.brandSoft,
    accentRing:   accent.brandRing,
    accentGrad:   accent.brandGradient,
    colorScheme:  'dark' as const,
  },
  light: {
    pageBg:       '#fafafa',
    headerBg:     'rgba(255, 255, 255, 0.78)',
    cardBg:       '#ffffff',
    cardBg2:      '#fafafa',
    tableHead:    '#f4f4f5',
    border:       '1px solid #e4e4e7',
    borderColor:  '#e4e4e7',
    border2:      '#d4d4d8',
    text:         '#09090b',
    textMuted:    '#52525b',
    textSubtle:   '#a1a1aa',
    textBody:     '#27272a',
    textHeader:   '#09090b',
    inputBg:      '#fafafa',
    inputBorder:  '#d4d4d8',
    modalBg:      'rgba(9, 9, 11, 0.45)',
    statGrad:     'linear-gradient(135deg,#ffffff 0%,#fafafa 100%)',
    accent:       accent.brand,
    accentHover:  accent.brandHover,
    accentSoft:   accent.brandSoft,
    accentRing:   accent.brandRing,
    accentGrad:   accent.brandGradient,
    colorScheme:  'light' as const,
  },
};

// ← change 'light' to 'dark' to revert
export const t = themes.light;
