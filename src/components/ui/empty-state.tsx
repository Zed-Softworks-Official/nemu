import { PlusCircleIcon } from 'lucide-react'
import Link from 'next/link'

export default function EmptyState({
    create_url,
    icon,
    heading,
    description,
    button_text
}: {
    create_url: string
    icon: React.ReactNode
    heading: string
    description: string
    button_text: string
}) {
    return (
        <div className="flex flex-col gap-10 justify-center items-center w-full h-full">
            <div className="flex flex-col gap-2 justify-center items-center">
                {icon}
                <h2 className="text-lg font-bold">{heading}</h2>
                <span className="text-md text-base-content/60">{description}</span>
            </div>
            <Link href={create_url} className="btn btn-primary text-white">
                <PlusCircleIcon className="w-6 h-6" />
                {button_text}
            </Link>
        </div>
    )
}
