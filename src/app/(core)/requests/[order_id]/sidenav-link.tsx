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
                'hover:underline',
                pathname.includes(props.path)
                    ? 'text-primary font-semibold'
                    : 'text-muted-foreground'
            )}
        >
            {props.children}
        </Link>
    )
}
