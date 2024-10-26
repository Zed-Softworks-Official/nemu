import { currentUser } from '@clerk/nextjs/server'
import { and, eq } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'

import { PortfolioUpdateForm } from '~/components/dashboard/forms/portfolio-form'
import UploadThingProvider from '~/components/files/uploadthing-context'
import DashboardContainer from '~/components/ui/dashboard-container'
import Loading from '~/components/ui/loading'

import type { ClientPortfolioItem } from '~/core/structures'
import { get_blur_data } from '~/lib/blur_data'

import { db } from '~/server/db'
import { portfolios } from '~/server/db/schema'

const get_portfolio_item = unstable_cache(
    async (item_id: string, artist_id: string) => {
        const portfolio_item = await db.query.portfolios.findFirst({
            where: and(eq(portfolios.id, item_id), eq(portfolios.artist_id, artist_id))
        })

        if (!portfolio_item) {
            return undefined
        }

        // Format for client
        const result: ClientPortfolioItem = {
            ...portfolio_item,
            image: {
                url: portfolio_item.image_url,
                blur_data: await get_blur_data(portfolio_item.image_url)
            }
        }

        return result
    },
    ['portfolio'],
    {
        tags: ['portfolio']
    }
)

export default async function PortfolioItemEditPage(props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    return (
        <DashboardContainer title="Edit Portfolio Item">
            <UploadThingProvider endpoint="portfolioUploader">
                <Suspense fallback={<Loading />}>
                    <PageContent item_id={params.id} />
                </Suspense>
            </UploadThingProvider>
        </DashboardContainer>
    )
}

async function PageContent(props: { item_id: string }) {
    const user = await currentUser()
    const portfolio_item = await get_portfolio_item(
        props.item_id,
        user?.privateMetadata.artist_id as string
    )

    if (!portfolio_item) {
        return notFound()
    }

    return <PortfolioUpdateForm portfolio_item={portfolio_item} />
}
