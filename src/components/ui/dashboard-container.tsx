import Link from 'next/link'
import { PlusCircleIcon } from 'lucide-react'
import { cn } from '~/lib/utils'

export default function DashboardContainer({
    title,
    addButtonUrl,
    contentClassName,
    children
}: {
    title: string
    addButtonUrl?: string
    contentClassName?: string
    children: React.ReactNode
}) {
    return (
        <div className="mx-5 flex w-full flex-col rounded-xl p-10">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">{title}</h1>
                {addButtonUrl && (
                    <Link
                        href={addButtonUrl}
                        className="btn btn-square btn-primary text-base-content"
                    >
                        <PlusCircleIcon className="h-6 w-6" />
                    </Link>
                )}
            </div>
            <div className="divider"></div>
            <div className={cn('h-full', contentClassName)}>{children}</div>
        </div>
    )
}
