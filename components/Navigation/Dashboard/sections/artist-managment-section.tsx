'use client'

import useSWR from 'swr'
import Link from 'next/link'

import { fetcher } from '@/helpers/fetcher'
import { useDashboardContext } from '../dashboard-context'

import { ClipboardDocumentIcon, CurrencyDollarIcon } from '@heroicons/react/20/solid'
import { StripeAccountResponse } from '@/helpers/api/request-inerfaces'

export default function DashboardArtistManagmentSection() {
    const { userId } = useDashboardContext()

    const { data: stripe_account } = useSWR<StripeAccountResponse>(
        `/api/stripe/${userId}/`,
        fetcher
    )

    return (
        <>
            {stripe_account?.dashboard_url ? (
                <li className="my-2">
                    <Link
                        href={`${stripe_account.dashboard_url}`}
                        target="_blank"
                        className="p-4 px-10 hover:bg-primary/60 rounded-xl"
                    >
                        <CurrencyDollarIcon className="sidenav-icon" />
                        <h3 className="inline text-lg font-bold">Merchant&apos;s Home</h3>
                    </Link>
                </li>
            ) : (
                <li className="my-2">
                    <Link
                        href={`${stripe_account?.onboarding_url}`}
                        target="_blank"
                        className="p-4 px-10 hover:bg-primary/60 rounded-3xl"
                    >
                        <ClipboardDocumentIcon className="sidenav-icon" />
                        <h3 className="inline text-lg font-bold">Onboarding</h3>
                    </Link>
                </li>
            )}
        </>
    )
}
