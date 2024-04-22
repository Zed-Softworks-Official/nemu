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
        <div className="bg-base-300 w-[90%] p-10 rounded-xl shadow-xl flex flex-col min-h-[70%] mt-10">
            <div className="flex justify-between items-center">
                <h1 className="font-bold text-2xl">{title}</h1>
                {addButtonUrl && (
                    <Link
                        href={addButtonUrl}
                        className="btn btn-square btn-primary text-base-content"
                    >
                        <PlusCircleIcon className="w-6 h-6" />
                    </Link>
                )}
            </div>
            <div className="divider"></div>
            <div className={cn(contentClassName)}>{children}</div>
        </div>
    )
}
