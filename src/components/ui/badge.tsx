import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '~/lib/utils'

const badgeVariants = cva(
    'badge',
    {
        variants: {
            variant: {
                default:
                    'badge-primary text-base-content',
                secondary:
                    'badge-secondary text-base-content',
                destructive:
                    'badge-error text-base-content',
                outline: 'text-base-content'
            }
        },
        defaultVariants: {
            variant: 'default'
        }
    }
)

export interface BadgeProps
    extends React.HTMLAttributes<HTMLDivElement>,
        VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
    return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
