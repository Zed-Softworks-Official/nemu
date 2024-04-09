import { cn } from '@/lib/utils'

export const BentoGrid = ({
    className,
    children
}: {
    className?: string
    children?: React.ReactNode
}) => {
    return (
        <div
            className={cn(
                'grid grid-cols-1 md:grid-cols-3 gap-4 max-w-7xl mx-auto ',
                className
            )}
        >
            {children}
        </div>
    )
}

export const BentoGridItem = ({
    className,
    title,
    description,
    content,
    disabledDivider,
    disabledDefaultPadding
}: {
    className?: string
    title?: string | React.ReactNode
    description?: string | React.ReactNode
    content?: React.ReactNode
    disabledDivider?: boolean
    disabledDefaultPadding?: boolean
}) => {
    return (
        <div
            className={cn(
                'row-span-1 rounded-xl p-4 bg-base-100 card shadow-xl h-full',
                className
            )}
        >
            <div className={cn(!disabledDefaultPadding && 'card-body')}>
                <div className="card-title">{title}</div>
                <div className="font-sans font-normal text-base-content">
                    {description}
                </div>
                {!disabledDivider && <div className="divider"></div>}
                {content}
            </div>
        </div>
    )
}
