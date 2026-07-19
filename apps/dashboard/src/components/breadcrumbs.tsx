'use client'

import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from '@nemu/ui/components/breadcrumb'
import { usePathname } from 'next/navigation'
import { Fragment, useMemo } from 'react'

export function DashboardBreadcrumbs() {
    const pathname = usePathname()
    const segments = useMemo(
        () => pathname.split('/').filter(Boolean),
        [pathname]
    )

    return (
        <Breadcrumb>
            <BreadcrumbList>
                {segments.map((segment, index) => (
                    <Fragment key={index}>
                        <BreadcrumbItem>
                            {index === segments.length - 1 ? (
                                <BreadcrumbPage>
                                    {segment.charAt(0).toUpperCase() +
                                        segment.slice(1)}
                                </BreadcrumbPage>
                            ) : (
                                <BreadcrumbLink
                                    href={`/${segments.slice(0, index + 1).join('/')}`}
                                >
                                    {segment.charAt(0).toUpperCase() +
                                        segment.slice(1)}
                                </BreadcrumbLink>
                            )}
                        </BreadcrumbItem>

                        {index < segments.length - 1 && <BreadcrumbSeparator />}
                    </Fragment>
                ))}
            </BreadcrumbList>
        </Breadcrumb>
    )
}
