
import Link from 'next/link'

import { useDashboardContext } from '../dashboard-context'

import { ClipboardDocumentIcon, CurrencyDollarIcon } from '@heroicons/react/20/solid'
import { api } from '@/core/trpc/react'

export default function DashboardArtistManagmentSection() {
    const { artist } = useDashboardContext()!
    const { data } = api.stripe.get_managment_url.useQuery(artist?.id!)

    return (
        <li className="my-2">
            <Link
                href={`${data?.url}`}
                target="_blank"
                className="p-4 px-10 hover:bg-primary/60 rounded-xl"
            >
                {data?.type === 'dashboard' ? (
                    <>
                        <CurrencyDollarIcon className="sidenav-icon" />
                        <h3 className="inline text-lg font-bold">Merchant's Home</h3>
                    </>
                ) : (
                    <>
                        <ClipboardDocumentIcon className="sidenav-icon" />
                        <h3 className="inline text-lg font-bold">Onboarding</h3>
                    </>
                )}
            </Link>
        </li>
    )
}
