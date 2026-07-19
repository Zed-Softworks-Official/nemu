import type { ReactNode } from 'react'

type PageHeaderProps = {
    title: string
    description: string
    eyebrow?: string
    actions?: ReactNode
}

export function PageHeader({
    title,
    description,
    eyebrow,
    actions,
}: PageHeaderProps) {
    return (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl space-y-1.5">
                {eyebrow ? (
                    <p className="font-medium text-primary text-xs uppercase tracking-[0.18em]">
                        {eyebrow}
                    </p>
                ) : null}
                <h1 className="font-heading font-semibold text-2xl tracking-tight sm:text-3xl">
                    {title}
                </h1>
                <p className="text-muted-foreground text-sm leading-relaxed">
                    {description}
                </p>
            </div>
            {actions ? (
                <div className="flex shrink-0 items-center gap-2">
                    {actions}
                </div>
            ) : null}
        </div>
    )
}
