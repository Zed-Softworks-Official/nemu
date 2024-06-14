import { and, eq } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'

import { db } from '~/server/db'
import { commissions, requests } from '~/server/db/schema'

import DashboardContainer from '~/components/ui/dashboard-container'

const get_recent_requests = unstable_cache(
    async (artist_id: string) => {
        // const db_requests = await db.query.requests.findMany({
        //     where: and(eq(requests., artist_id), eq(commissions., ''))
        // })
    },
    ['recent_commissions'],
    {
        tags: ['commission_requests']
    }
)

export default function DashboardHome() {
    return (
        <DashboardContainer title="Home">
            <>Hello, World!</>
        </DashboardContainer>
    )
}
