'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function DashboardBreadcrumbs() {
    const pathname = usePathname()
    const breadcrumbs = pathname
        .substring(1, pathname.length)
        .split('/')
        .map((word) => {
            if (word.includes('-')) {
                return ''
            }
            return word[0].toUpperCase() + word.slice(1).toLowerCase()
        })

    return (
        <div className="text-sm breadcrumbs">
            <ul>
                {breadcrumbs.map((path, index) =>
                    path != '' && (
                        <li>
                            <Link href={`${pathname.substring(0)}`}>{path}</Link>
                        </li>
                    )
                )}
            </ul>
        </div>
    )
}
