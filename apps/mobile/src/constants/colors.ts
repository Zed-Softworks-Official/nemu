/**
 * Concrete colors for APIs that can't read CSS vars (Lucide, some RN style props).
 * Keep in sync with apps/mobile/src/global.css dark tokens.
 */
export const colors = {
    background: '#171819',
    foreground: '#f0f2f5',
    mutedForeground: '#979ca3',
    primary: '#398cfa',
    border: 'rgba(255,255,255,0.08)',
} as const
