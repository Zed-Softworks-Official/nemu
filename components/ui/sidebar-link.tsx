'use client'

import { cn } from '@/lib/utils'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function SidebarLink({
    title,
    path,
    href,
    icon
}: {
    title: string
    path: string
    href: string
    icon: React.ReactNode
}) {
    const pathname = usePathname()

    return (
        <li>
            <Link href={href} className={cn('hover:bg-primary flex items-center', pathname.includes(path))}>
                {icon}
                <h3 className="inline text-lg font-bold">{title}</h3>
            </Link>
        </li>
    )
}
