'use client'

import useSWR from 'swr'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { fetcher } from '@/helpers/fetcher'
import classNames from '@/helpers/classnames'

import { useDashboardContext } from '../DashboardContext'

import { CurrencyDollarIcon, EnvelopeIcon } from '@heroicons/react/20/solid'

export default function DashboardUserSection() {
    const pathname = usePathname()
    const { stripe_id } = useDashboardContext()

    const { data: stripe_account } = useSWR(
        `/api/stripe/${stripe_id}/dashboard`,
        fetcher
    )

    return (
        <div>
            {stripe_id && (
                <div className="my-10">
                    <Link
                        href={`${stripe_account?.dashboard_url}`}
                        target="_blank"
                        className="p-4 px-10 hover:bg-primary/60 rounded-3xl"
                    >
                        <CurrencyDollarIcon className="sidenav-icon" />
                        <h3 className="inline mt-6 text-lg font-bold">
                            Merchant's Home
                        </h3>
                    </Link>
                </div>
            )}
            <div className="my-10">
                <Link
                    href={'/dashboard/messages'}
                    className={classNames(
                        pathname.includes('messages')
                            ? 'bg-primary text-white'
                            : 'hover:bg-primary/60',
                        'p-4 px-10 rounded-3xl'
                    )}
                >
                    <EnvelopeIcon className="sidenav-icon" />
                    <h3 className="inline mt-6 text-lg font-bold">Messages</h3>
                </Link>
            </div>
        </div>
    )
}
