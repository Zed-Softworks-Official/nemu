import { cn } from '@nemu/ui/lib/utils'
import { cva, type VariantProps } from 'class-variance-authority'
import { Pressable, type PressableProps } from 'react-native'

import { Text } from '~/components/ui/text'

const buttonVariants = cva(
    'items-center justify-center rounded-sm border border-transparent px-5',
    {
        variants: {
            variant: {
                default: 'bg-primary active:bg-primary/90',
                outline:
                    'border-border bg-transparent active:border-primary/40 active:bg-primary/5',
                secondary: 'bg-secondary active:opacity-90',
                ghost: 'bg-transparent active:bg-muted',
                destructive: 'bg-destructive/10 active:bg-destructive/20',
            },
            size: {
                default: 'h-9 flex-1',
                sm: 'h-8 flex-1',
                lg: 'h-10 flex-1',
                xl: 'h-11 flex-1',
            },
        },
        defaultVariants: {
            variant: 'default',
            size: 'default',
        },
    }
)

const buttonTextVariants = cva('text-center font-sans-medium text-sm', {
    variants: {
        variant: {
            default: 'text-primary-foreground',
            outline: 'text-foreground',
            secondary: 'text-secondary-foreground',
            ghost: 'text-foreground',
            destructive: 'text-destructive',
        },
    },
    defaultVariants: {
        variant: 'default',
    },
})

type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>

/** Dark-mode fallbacks — mobile is dark-only */
const buttonTextFallback: Record<ButtonVariant, string> = {
    default: '#030303',
    outline: '#f0f2f5',
    secondary: '#e9ebee',
    ghost: '#f0f2f5',
    destructive: '#ff6568',
}

type ButtonProps = PressableProps &
    VariantProps<typeof buttonVariants> & {
        title: string
        className?: string
        textClassName?: string
    }

export function Button({
    title,
    variant = 'default',
    size = 'default',
    className,
    textClassName,
    disabled,
    ...props
}: ButtonProps) {
    const resolvedVariant = variant ?? 'default'

    return (
        <Pressable
            accessibilityRole="button"
            className={cn(
                buttonVariants({ variant, size }),
                disabled && 'opacity-50',
                className
            )}
            disabled={disabled}
            {...props}
        >
            <Text
                className={cn(buttonTextVariants({ variant }), textClassName)}
                style={{ color: buttonTextFallback[resolvedVariant] }}
            >
                {title}
            </Text>
        </Pressable>
    )
}
