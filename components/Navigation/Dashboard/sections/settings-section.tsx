'use client'

import Link from 'next/link'
import { ClassNames } from '@/core/helpers'
import {
    Cog6ToothIcon,
    CurrencyDollarIcon,
    PaintBrushIcon
} from '@heroicons/react/20/solid'
import { usePathname } from 'next/navigation'
import { useDashboardContext } from '../dashboard-context'
import { api } from '@/core/trpc/react'

export default function DashboardSettingsSection() {
    const pathname = usePathname()
    const { artist } = useDashboardContext()!

    const { data, isLoading } = api.stripe.get_checkout_portal.useQuery()

    if (isLoading) {
        return null
    }

    return (
        <>
            {artist.handle && (
                <li className="my-2">
                    <Link
                        href={`/@${artist.handle}`}
                        className={'hover:bg-primary/60 p-4 px-10 rounded-xl'}
                    >
                        <PaintBrushIcon className="sidenav-icon" />
                        <h3 className="inline text-lg font-bold">My Page</h3>
                    </Link>
                </li>
            )}
            {data && (
                <li className="my-2">
                    <Link
                        href={data}
                        className={'hover:bg-primary/60 p-4 px-10 rounded-xl'}
                    >
                        <CurrencyDollarIcon className="w-6 h-6" />
                        <h3 className="inline text-lg font-bold">Billing</h3>
                    </Link>
                </li>
            )}
            <li className="my-2">
                <Link
                    href={'/dashboard/account'}
                    className={ClassNames(
                        pathname.includes('account')
                            ? 'bg-primary text-white'
                            : 'hover:bg-primary/60',
                        'p-4 px-10 rounded-xl'
                    )}
                >
                    <Cog6ToothIcon className="sidenav-icon" />
                    <h3 className="inline text-lg font-bold">Settings</h3>
                </Link>
            </li>
        </>
    )
}
