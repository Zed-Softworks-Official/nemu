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

export function DashboardBreadcrumbs() {
    const pathname = usePathname().split('/')

    return (
        <Breadcrumb className="hidden pl-4 md:flex">
            <BreadcrumbList>
                {pathname.map((item, index) => (
                    <DrashboardBreadcrumbItem
                        key={item}
                        item={item}
                        index={index}
                        total_length={pathname.length}
                        items={pathname}
                    />
                ))}
            </BreadcrumbList>
        </Breadcrumb>
    )
}

function DrashboardBreadcrumbItem(props: {
    item: string
    index: number
    total_length: number
    items: string[]
}) {
    const title =
        props.item.substring(0, 1).toUpperCase() +
        props.item.substring(1, props.item.length)

    let href = '/'
    for (let i = 1; i < props.index + 1; i++) {
        if (i === props.index) {
            href += props.item
            continue
        }

        href += props.items[i] + '/'
    }

    if (props.index === 0) {
        return null
    }

    if (props.index === props.total_length - 1) {
        return <BreadcrumbPage>{title}</BreadcrumbPage>
    }

    return (
        <>
            <BreadcrumbItem>
                <BreadcrumbLink href={href}>{title}</BreadcrumbLink>
            </BreadcrumbItem>
            {props.index !== props.total_length - 1 && (
                <BreadcrumbSeparator>
                    <SlashIcon className="h-6 w-6" />
                </BreadcrumbSeparator>
            )}
        </>
    )
}
