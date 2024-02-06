'use client'

import { GraphQLFetcher } from '@/core/helpers'
import { useSession } from 'next-auth/react'
import useSWR from 'swr'
import { DashboardProvider } from '../navigation/dashboard/dashboard-context'

export default function DsahboardSetContext({ children }: { children: React.ReactNode }) {
    const { data: session } = useSession()
    const { data, isLoading } = useSWR(
        `
    {
        user(id: "${session?.user.user_id}") {
          artist {
                id
                handle
                stripeAccount
            }
        }
    }
    `,
        GraphQLFetcher<{
            user: { artist: { id: string; handle: string; stripeAccount: string } }
        }>
    )

    if (isLoading) {
        return null
    }

    return (
        <DashboardProvider
            artist_handle={data?.user.artist.handle!}
            artist_id={data?.user.artist?.id!}
            artist_stripe_id={data?.user.artist?.stripeAccount ? data.user.artist.stripeAccount : ''}
            user_id={session?.user.user_id!}
        >
            {children}
        </DashboardProvider>
    )
}
