import { cn } from '~/lib/utils'

export default function Masonry({
    columns,
    children
}: {
    columns: '3' | '4'
    children: React.ReactNode
}) {
    return (
        <div
            className={cn(
                'columns-1 gap-5 space-y-5 sm:columns-2',
                columns === '3' ? 'lg:columns-3' : 'lg:columns-4'
            )}
        >
            {children}
        </div>
    )
}
