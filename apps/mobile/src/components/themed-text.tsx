import {
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    useFonts,
} from '@expo-google-fonts/manrope'
import { Platform, StyleSheet, Text, type TextProps } from 'react-native'
import { Fonts, type ThemeColor } from '~/constants/theme'
import { useTheme } from '~/hooks/use-theme'

export type ThemedTextProps = TextProps & {
    type?:
        | 'default'
        | 'title'
        | 'small'
        | 'smallBold'
        | 'subtitle'
        | 'link'
        | 'linkPrimary'
        | 'code'
    themeColor?: ThemeColor
}

export function ThemedText({
    style,
    type = 'default',
    themeColor,
    ...rest
}: ThemedTextProps) {
    const theme = useTheme()

    const [fontsLoaded] = useFonts({
        Manrope_400Regular,
        Manrope_500Medium,
        Manrope_600SemiBold,
        Manrope_700Bold,
    })

    if (!fontsLoaded) {
        return null
    }

    return (
        <Text
            style={[
                {
                    color: theme[themeColor ?? 'text'],
                    fontFamily: 'Manrope_400Regular',
                },
                styles[type],
                style,
            ]}
            {...rest}
        />
    )
}

const styles = StyleSheet.create({
    small: {
        fontSize: 14,
        lineHeight: 20,
        fontWeight: 500,
    },
    smallBold: {
        fontSize: 14,
        lineHeight: 20,
        fontWeight: 700,
    },
    default: {
        fontSize: 16,
        lineHeight: 24,
        fontWeight: 500,
    },
    title: {
        fontSize: 48,
        fontWeight: 600,
        lineHeight: 52,
    },
    subtitle: {
        fontSize: 32,
        lineHeight: 44,
        fontWeight: 600,
    },
    link: {
        lineHeight: 30,
        fontSize: 14,
    },
    linkPrimary: {
        lineHeight: 30,
        fontSize: 14,
        color: '#3c87f7',
    },
    code: {
        fontFamily: Fonts.mono,
        fontWeight: Platform.select({ android: 700 }) ?? 500,
        fontSize: 12,
    },
})
