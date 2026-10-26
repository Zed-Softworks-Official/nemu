import { cn } from '@nemu/ui/lib/utils'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            className={cn('animate-pulse rounded-sm bg-muted', className)}
            data-slot="skeleton"
            {...props}
        />
    )
}

export { Skeleton }
