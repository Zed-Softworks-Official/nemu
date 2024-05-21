'use client'

import { SlashIcon } from 'lucide-react'
import { usePathname } from 'next/navigation'
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator
} from '~/components/ui/breadcrumb'

export default function DashboardBreadcrumbs() {
    const pathname = usePathname()
        .split('/')
        .map(
            (item) => item.substring(0, 1).toUpperCase() + item.substring(1, item.length)
        )

    return (
        <Breadcrumb className="hidden md:flex">
            <BreadcrumbList>
                {pathname.map((item, index) => {
                    if (index === 0) {
                        return null
                    }

                    if (index === pathname.length - 1) {
                        return <BreadcrumbPage key={item}>{item}</BreadcrumbPage>
                    }

                    return (
                        <>
                            <BreadcrumbItem key={item}>
                                <BreadcrumbLink href="/dashboard">{item}</BreadcrumbLink>
                            </BreadcrumbItem>
                            {index !== pathname.length - 1 && (
                                <BreadcrumbSeparator key={`separator-${item}`}>
                                    <SlashIcon className="h-6 w-6" />
                                </BreadcrumbSeparator>
                            )}
                        </>
                    )
                })}
            </BreadcrumbList>
        </Breadcrumb>
    )
}
