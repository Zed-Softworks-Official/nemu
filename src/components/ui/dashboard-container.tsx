import Link from 'next/link'
import { PlusCircleIcon } from 'lucide-react'

export default function DashboardContainer({
    title,
    addButtonUrl,
    children
}: {
    title: string
    addButtonUrl?: string
    children: React.ReactNode
}) {
    return (
        <main className="py-14 justify-around w-[90%] transition-all duration-200 ease-in-out relative shadow-xl bg-base-300 rounded-xl p-10 min-h-[70%]">
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
            {children}
        </main>
    )
}
