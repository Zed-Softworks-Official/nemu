import { cn } from '@nemu/ui/lib/utils'
import { Text as RNText, type TextProps } from 'react-native'

import { manropeFamilyFromClassName } from '~/lib/manrope'

type AppTextProps = TextProps & {
    className?: string
}

/**
 * App text — always Manrope. Import this instead of react-native's Text.
 *
 * Weights (use either Tailwind weight or font-sans-*):
 * - default / font-normal → regular
 * - font-medium / font-sans-medium → medium
 * - font-semibold / font-sans-semibold → semibold
 * - font-bold / font-sans-bold → bold
 */
export function Text({ className, style, ...props }: AppTextProps) {
    return (
        <RNText
            className={cn('font-sans', className)}
            style={[
                { fontFamily: manropeFamilyFromClassName(className) },
                style,
            ]}
            {...props}
        />
    )
}
