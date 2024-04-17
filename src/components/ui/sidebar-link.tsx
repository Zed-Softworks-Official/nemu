'use client'

import { cn } from '~/lib/utils'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function SidebarLink({
    title,
    href,
    icon,
    path
}: {
    title: string
    href: string
    icon: React.ReactNode
    path?: string
}) {
    const pathname = usePathname()

    return (
        <li>
            <Link
                href={href}
                className={cn(
                    'hover:bg-primary flex items-center',
                    path && pathname.includes(path) && 'bg-primary'
                )}
            >
                {icon}
                <h3 className="inline text-lg font-bold">{title}</h3>
            </Link>
        </li>
    )
}
