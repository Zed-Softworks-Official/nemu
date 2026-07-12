import type { ReactNode } from 'react'
import { cn } from '~/lib/utils'

type LandingSectionProps = {
    children: ReactNode
    className?: string
    glow?: boolean
    grid?: boolean
    id?: string
}

export function LandingSection({
    children,
    className,
    glow = false,
    grid = false,
    id,
}: LandingSectionProps) {
    return (
        <section
            className={cn(
                'relative scroll-mt-20 overflow-hidden border-border border-t bg-background',
                className
            )}
            id={id}
        >
            {glow ? (
                <div
                    aria-hidden="true"
                    className="landing-hero-glow pointer-events-none absolute inset-0 opacity-50"
                />
            ) : null}
            {grid ? (
                <div
                    aria-hidden="true"
                    className="landing-grid-bg pointer-events-none absolute inset-0 opacity-40"
                />
            ) : null}
            <div className="relative mx-auto max-w-6xl px-5 py-24 sm:px-8 lg:py-28">
                {children}
            </div>
        </section>
    )
}
