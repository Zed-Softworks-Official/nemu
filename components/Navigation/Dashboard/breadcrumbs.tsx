'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function DashboardBreadcrumbs() {
    const paths = usePathname()
    const pathnames = paths.split('/').filter(path => path)

    return (
        <div className="text-sm breadcrumbs">
            <ul>
                {pathnames.map((path, index) => {
                    let href = `/${pathnames.slice(0, index + 1).join('/')}`

                    return (
                        <li key={path}>
                            <Link href={href}>{path}</Link>
                        </li>
                    )
                })}
            </ul>
        </div>
    )
}
