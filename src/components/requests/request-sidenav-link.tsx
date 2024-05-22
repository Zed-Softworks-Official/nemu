'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '~/lib/utils'

export default function RequestSidenavLink(props: {
    href: string
    children: React.ReactNode
    path: string
}) {
    const pathname = usePathname()

    return (
        <Link
            href={props.href}
            className={cn(
                'link-hover link',
                pathname.includes(props.path)
                    ? 'font-semibold text-primary'
                    : 'text-base-content/80'
            )}
        >
            {props.children}
        </Link>
    )
}
