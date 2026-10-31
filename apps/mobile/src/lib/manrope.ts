import { Text, TextInput } from 'react-native'

/** PostScript / expo-font names for Manrope weights */
export const Manrope = {
    regular: 'Manrope_400Regular',
    medium: 'Manrope_500Medium',
    semibold: 'Manrope_600SemiBold',
    bold: 'Manrope_700Bold',
} as const

export type ManropeWeight = keyof typeof Manrope

/**
 * Map Tailwind / NativeWind font classes to a Manrope family.
 * RN ignores fontWeight for custom fonts — the family name is the weight.
 */
export function manropeFamilyFromClassName(className?: string): string {
    if (!className) return Manrope.regular
    if (
        className.includes('font-sans-bold') ||
        className.includes('font-bold') ||
        /\bfont-extrabold\b/.test(className) ||
        /\bfont-black\b/.test(className)
    ) {
        return Manrope.bold
    }
    if (
        className.includes('font-sans-semibold') ||
        className.includes('font-semibold')
    ) {
        return Manrope.semibold
    }
    if (
        className.includes('font-sans-medium') ||
        className.includes('font-medium')
    ) {
        return Manrope.medium
    }
    return Manrope.regular
}

/**
 * Apply Manrope as the default for any Text / TextInput that still
 * comes from react-native (third-party or missed imports).
 * Call once at app startup, after fonts are loaded.
 */
export function applyManropeDefaults() {
    const base = { fontFamily: Manrope.regular }

    // defaultProps is deprecated in React types but still honored by RN.
    const textDefaults = Text as typeof Text & {
        defaultProps?: { style?: unknown }
    }
    textDefaults.defaultProps = {
        ...textDefaults.defaultProps,
        style: [base, textDefaults.defaultProps?.style],
    }

    const inputDefaults = TextInput as typeof TextInput & {
        defaultProps?: { style?: unknown }
    }
    inputDefaults.defaultProps = {
        ...inputDefaults.defaultProps,
        style: [base, inputDefaults.defaultProps?.style],
    }
}
