'use client'

import useSWR from 'swr'
import Link from 'next/link'

import { fetcher } from '@/helpers/fetcher'
import { StripeAccountResponse } from '@/helpers/stripe'
import { useDashboardContext } from '../dashboard-context'

import { ClipboardDocumentIcon, CurrencyDollarIcon } from '@heroicons/react/20/solid'

export default function DashboardArtistManagmentSection() {
    const { userId } = useDashboardContext()

    const { data: stripe_account } = useSWR<StripeAccountResponse>(`/api/stripe/${userId}/`, fetcher)

    return (
        <>
            {stripe_account?.dashboard_url ? (
                <div className="my-10">
                    <Link
                        href={`${stripe_account.dashboard_url}`}
                        target="_blank"
                        className="p-4 px-10 hover:bg-primary/60 rounded-3xl"
                    >
                        <CurrencyDollarIcon className="sidenav-icon" />
                        <h3 className="inline mt-6 text-lg font-bold">Merchant&apos;s Home</h3>
                    </Link>
                </div>
            ) : (
                <div className="my-10">
                    <Link
                        href={`${stripe_account?.onboarding_url}`}
                        target="_blank"
                        className="p-4 px-10 hover:bg-primary/60 rounded-3xl"
                    >
                        <ClipboardDocumentIcon className="sidenav-icon" />
                        <h3 className="inline mt-6 text-lg font-bold">Onboarding</h3>
                    </Link>
                </div>
            )}
        </>
    )
}
