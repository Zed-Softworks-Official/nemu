'use client'

import { usePathname } from 'next/navigation'

export default function DashboardBreadcrumbs() {
    const pathname = usePathname()
    const breadcrumbs = pathname
        .substring(1, pathname.length)
        .split('/')
        .map((word) => {
            return word[0].toUpperCase() + word.slice(1).toLowerCase()
        })

    return (
        <div className="text-sm breadcrumbs">
            <ul >
                {breadcrumbs.map((path) => (
                    <li>{path}</li>
                ))}
            </ul>
        </div>
    )
}
