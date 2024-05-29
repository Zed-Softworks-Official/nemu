import DashboardContainer from '~/components/ui/dashboard-container'

import Link from 'next/link'
import { EyeIcon, FolderPlusIcon } from 'lucide-react'

import NemuImage from '~/components/nemu-image'
import EmptyState from '~/components/ui/empty-state'
import { format_to_currency, get_availability_badge_data } from '~/lib/utils'
import { Badge } from '~/components/ui/badge'
import { Card, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'

import { currentUser } from '@clerk/nextjs/server'
import { Suspense } from 'react'
import Loading from '~/components/ui/loading'
import { unstable_cache } from 'next/cache'
import { db } from '~/server/db'
import { eq } from 'drizzle-orm'
import { commissions } from '~/server/db/schema'
import { ClientCommissionItem, CommissionAvailability } from '~/core/structures'
import { get_blur_data } from '~/lib/blur_data'

const get_commissions = unstable_cache(
    async (artist_id: string) => {
        const db_commissions = await db.query.commissions.findMany({
            where: eq(commissions.artist_id, artist_id),
            with: {
                artist: true
            }
        })

        if (!db_commissions) {
            return undefined
        }

        // Format for client
        const result: ClientCommissionItem[] = []
        for (const commission of db_commissions) {
            if (!commission.published) {
                continue
            }

            result.push({
                title: commission.title,
                description: commission.description,
                price: format_to_currency(Number(commission.price)),
                availability: commission.availability as CommissionAvailability,
                rating: Number(commission.rating),
                published: commission.published,
                images: [
                    {
                        url: commission.images[0]?.url!,
                        blur_data: await get_blur_data(commission.images[0]?.url!)
                    }
                ],
                slug: commission.slug,
                total_requests: commission.total_requests,
                new_requests: commission.new_requests,
                artist: {
                    handle: commission.artist.handle,
                    supporter: commission.artist.supporter
                }
            })
        }

        return result
    },
    ['commissions-list-dashboard']
)

export default async function CommissionsDashboardPage() {
    return (
        <Suspense fallback={<Loading />}>
            <CommissionsDisplay />
        </Suspense>
    )
}

async function CommissionsDisplay() {
    const user = await currentUser()
    const commissions = await get_commissions(user?.privateMetadata.artist_id as string)

    if (!commissions || commissions.length === 0) {
        return (
            <DashboardContainer title="Commissions" contentClassName="h-full">
                <EmptyState
                    create_url="/dashboard/commissions/create"
                    heading="No Commissions Found"
                    description="Create a new commission to get started"
                    button_text="Create Commission"
                    icon={<FolderPlusIcon className="h-10 w-10" />}
                />
            </DashboardContainer>
        )
    }

    return (
        <DashboardContainer
            title="Commissions"
            addButtonUrl="/dashboard/commissions/create"
        >
            <div className="grid grid-cols-1 gap-5">
                {commissions.map((commission) => (
                    <CommissionCard key={commission.slug} commission={commission} />
                ))}
            </div>
        </DashboardContainer>
    )
}

function CommissionCard({ commission }: { commission: ClientCommissionItem }) {
    const [variant, text] = get_availability_badge_data(commission.availability)

    return (
        <div className="card animate-pop-in bg-base-100 transition-all duration-150 lg:card-side">
            <figure>
                <NemuImage
                    src={commission.images[0]?.url!}
                    placeholder="blur"
                    blurDataURL={commission.images[0]?.blur_data}
                    alt={`${commission.title} Featured Image`}
                    width={200}
                    height={200}
                    className="w-full"
                />
            </figure>
            <div className="card-body">
                <h2 className="flex items-center gap-2 text-2xl font-bold">
                    {commission.title}
                    <Badge variant={variant} className="badge-lg">
                        {text}
                    </Badge>
                    <Badge
                        variant={commission.published ? 'default' : 'destructive'}
                        className="badge-lg"
                    >
                        {commission.published ? 'Published' : 'Unpublished'}
                    </Badge>
                </h2>
                <div className="divider"></div>
                <div className="grid grid-cols-2 gap-5">
                    <Card>
                        <CardHeader>
                            <CardTitle>Total Requests</CardTitle>
                            <CardDescription>{commission.total_requests}</CardDescription>
                        </CardHeader>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle>New Requests</CardTitle>
                            <CardDescription>{commission.new_requests}</CardDescription>
                        </CardHeader>
                    </Card>
                </div>
                <div className="mt-10 flex h-full items-end justify-end gap-5">
                    <Link
                        href={`/dashboard/commissions/${commission.slug}`}
                        className="btn btn-primary btn-wide text-white"
                    >
                        <EyeIcon className="h-6 w-6" />
                        View Commission
                    </Link>
                </div>
            </div>
        </div>
    )
}
