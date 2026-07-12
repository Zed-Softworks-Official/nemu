import { Badge } from '~/components/ui/badge'
import { cn } from '~/lib/utils'

type SectionHeaderProps = {
    badge: string
    title: string
    description?: string
    align?: 'left' | 'center'
    className?: string
}

export function SectionHeader({
    badge,
    title,
    description,
    align = 'left',
    className,
}: SectionHeaderProps) {
    const centered = align === 'center'

    return (
        <div
            className={cn(
                'mb-14 max-w-2xl',
                centered && 'mx-auto text-center',
                className
            )}
        >
            <Badge className="mb-4" variant="soft">
                {badge}
            </Badge>
            <h2 className="font-extrabold font-heading text-3xl text-foreground tracking-tight sm:text-4xl lg:text-[2.75rem] lg:leading-tight">
                {title}
            </h2>
            {description ? (
                <p
                    className={cn(
                        'mt-4 text-base text-muted-foreground leading-relaxed sm:text-lg',
                        centered && 'mx-auto'
                    )}
                >
                    {description}
                </p>
            ) : null}
        </div>
    )
}
