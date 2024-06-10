import DashboardContainer from '~/components/ui/dashboard-container'

import Link from 'next/link'
import { EyeIcon, FolderPlusIcon } from 'lucide-react'

import NemuImage from '~/components/nemu-image'
import EmptyState from '~/components/ui/empty-state'
import { get_availability_badge_data } from '~/lib/utils'
import { Badge } from '~/components/ui/badge'
import { Card, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'

import { currentUser } from '@clerk/nextjs/server'
import { Suspense } from 'react'
import Loading from '~/components/ui/loading'
import { ClientCommissionItem, CommissionAvailability } from '~/core/structures'
import { get_commission_list } from '~/server/db/query'

export default function CommissionsDashboardPage() {
    return (
        <Suspense fallback={<Loading />}>
            <PageContent />
        </Suspense>
    )
}

async function PageContent() {
    const user = await currentUser()
    const commissions = await get_commission_list(
        user!.privateMetadata.artist_id as string
    )

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
