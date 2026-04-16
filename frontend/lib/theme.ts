// ─────────────────────────────────────────────────────────────────────────────
// Theme toggle — to revert to dark mode change the last line to:
//   export const t = themes.dark;
// ─────────────────────────────────────────────────────────────────────────────

const themes = {
  dark: {
    pageBg:       '#0a0a0f',
    headerBg:     'rgba(30,41,59,0.3)',
    cardBg:       '#1e293b',
    cardBg2:      '#0f172a',
    tableHead:    '#0f172a',
    border:       '1px solid #334155',
    borderColor:  '#334155',
    border2:      '#475569',
    text:         '#ffffff',
    textMuted:    '#94a3b8',
    textSubtle:   '#64748b',
    textBody:     '#e2e8f0',
    textHeader:   '#f1f5f9',
    inputBg:      '#0f172a',
    inputBorder:  '#475569',
    modalBg:      'rgba(0,0,0,0.6)',
    statGrad:     'linear-gradient(135deg,#1e293b 0%,#0f172a 100%)',
    colorScheme:  'dark' as const,
  },
  light: {
    pageBg:       '#f1f5f9',
    headerBg:     '#ffffff',
    cardBg:       '#ffffff',
    cardBg2:      '#f8fafc',
    tableHead:    '#f1f5f9',
    border:       '1px solid #e2e8f0',
    borderColor:  '#e2e8f0',
    border2:      '#cbd5e1',
    text:         '#0f172a',
    textMuted:    '#475569',
    textSubtle:   '#94a3b8',
    textBody:     '#1e293b',
    textHeader:   '#0f172a',
    inputBg:      '#f8fafc',
    inputBorder:  '#cbd5e1',
    modalBg:      'rgba(15,23,42,0.5)',
    statGrad:     'linear-gradient(135deg,#ffffff 0%,#f8fafc 100%)',
    colorScheme:  'light' as const,
  },
};

// ← change 'light' to 'dark' to revert
export const t = themes.light;
