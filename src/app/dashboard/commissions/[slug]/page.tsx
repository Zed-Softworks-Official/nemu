import Link from 'next/link'
import { unstable_cache } from 'next/cache'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'

import { PencilIcon } from 'lucide-react'
import { clerkClient, currentUser } from '@clerk/nextjs/server'

import {
    type ClientCommissionItem,
    type ClientRequestData,
    type CommissionAvailability,
    type NemuImageData
} from '~/core/structures'

import { db } from '~/server/db'
import { artists, commissions } from '~/server/db/schema'
import { and, eq } from 'drizzle-orm'
import { get_blur_data } from '~/lib/blur_data'
import { format_to_currency } from '~/lib/utils'
import Loading from '~/components/ui/loading'
import CommissionRequestTable from '~/components/dashboard/commission-request-table'

import CommissionPublishButton from '~/components/dashboard/commission-publish'

const get_commission_requests = unstable_cache(
    async (slug: string, handle: string) => {
        const artist = await db.query.artists.findFirst({
            where: eq(artists.handle, handle)
        })

        if (!artist) {
            return undefined
        }

        const commission = await db.query.commissions.findFirst({
            where: and(eq(commissions.slug, slug), eq(commissions.artist_id, artist.id)),
            with: {
                requests: true
            }
        })

        if (!commission) {
            return undefined
        }

        // Format for client
        const images: NemuImageData[] = []

        for (const image of commission?.images) {
            images.push({
                url: image.url,
                blur_data: await get_blur_data(image.url)
            })
        }

        const requests: ClientRequestData[] = []
        const clerk_client = await clerkClient()

        for (const request of commission.requests) {
            requests.push({
                ...request,
                user: {
                    id: request.user_id,
                    username:
                        (await clerk_client.users.getUser(request.user_id)).username ??
                        'User'
                }
            })
        }

        const result: ClientCommissionItem = {
            id: commission.id,
            title: commission.title,
            description: commission.description,
            price: format_to_currency(Number(commission.price)),
            availability: commission.availability as CommissionAvailability,
            rating: Number(commission.rating),
            images: images,
            slug: commission.slug,
            published: commission.published,
            total_requests: commission.total_requests,
            new_requests: commission.new_requests,
            requests: requests
        }

        return result
    },
    ['commission_requests'],
    {
        tags: ['commission_requests']
    }
)

export default async function CommissionDetailPage(props: {
    params: Promise<{ slug: string }>
}) {
    const params = await props.params

    return (
        <div className="container mx-auto flex flex-col gap-5 px-5">
            <div className="flex flex-row items-center justify-between">
                <h1 className="text-3xl font-bold">Commission Title</h1>
                <div className="flex gap-2">
                    <Link
                        className="btn btn-outline"
                        href={`/dashboard/commissions/${params.slug}/update`}
                    >
                        <PencilIcon className="h-6 w-6" />
                        Edit Commission
                    </Link>
                    <Suspense fallback={<div className="skeleton h-10 w-16"></div>}>
                        <PublishButton slug={params.slug} />
                    </Suspense>
                </div>
            </div>

            <Suspense fallback={<Loading />}>
                <RequestList slug={params.slug} />
            </Suspense>
        </div>
    )
}

async function PublishButton(props: { slug: string }) {
    const clerk_user = await currentUser()

    if (!clerk_user) {
        return redirect('/u/login')
    }

    const commission = await get_commission_requests(
        props.slug,
        clerk_user.publicMetadata.handle as string
    )

    return <CommissionPublishButton id={commission.id} published={commission.published} />
}

async function RequestList(props: { slug: string }) {
    const clerk_user = await currentUser()

    if (!clerk_user) {
        return redirect('/u/login')
    }

    const commission = await get_commission_requests(
        props.slug,
        clerk_user.publicMetadata.handle as string
    )

    if (!commission?.requests) {
        return null
    }

    return <CommissionRequestTable requests={commission.requests} />
}
