import DashboardContainer from '~/components/ui/dashboard-container'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { EyeIcon, FolderPlusIcon, PencilIcon } from 'lucide-react'

import { getServerAuthSession } from '~/server/auth'
import { api } from '~/trpc/server'
import NemuImage from '~/components/nemu-image'
import EmptyState from '~/components/ui/empty-state'
import { get_availability_badge_data } from '~/lib/utils'
import { Badge } from '~/components/ui/badge'
import { Card, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'

export default async function CommissionsDashboardPage() {
    const session = await getServerAuthSession()

    if (!session || !session.user.artist_id) {
        return redirect('/u/login')
    }

    const commissions = await api.commission.get_commission_list({
        artist_id: session.user.artist_id!,
        include_stats: true,
        show_unpublished: true,
    })

    if (!commissions || commissions.length === 0) {
        return (
            <DashboardContainer title="Commissions" contentClassName="h-full">
                <EmptyState
                    create_url="/dashboard/commissions/create"
                    heading="No Commissions Found"
                    description="Create a new commission to get started"
                    button_text="Create Commission"
                    icon={<FolderPlusIcon className="w-10 h-10" />}
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
                {commissions.map((commission) => {
                    const [variant, text] = get_availability_badge_data(
                        commission.availability
                    )

                    return (
                        <div
                            key={commission.title}
                            className="card lg:card-side bg-base-100 shadow-xl animate-pop-in duration-150 transition-all"
                        >
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
                                <h2 className="text-2xl font-bold flex items-center gap-2">
                                    {commission.title}
                                    <Badge variant={variant} className="badge-lg">
                                        {text}
                                    </Badge>
                                    <Badge
                                        variant={
                                            commission.published
                                                ? 'default'
                                                : 'destructive'
                                        }
                                        className="badge-lg"
                                    >
                                        {commission.published
                                            ? 'Published'
                                            : 'Unpublished'}
                                    </Badge>
                                </h2>
                                <div className="divider"></div>
                                <div className="grid grid-cols-2 gap-5">
                                    <Card>
                                        <CardHeader>
                                            <CardTitle>Total Requests</CardTitle>
                                            <CardDescription>
                                                {commission.total_requests}
                                            </CardDescription>
                                        </CardHeader>
                                    </Card>
                                    <Card>
                                        <CardHeader>
                                            <CardTitle>New Requests</CardTitle>
                                            <CardDescription>
                                                {commission.new_requests}
                                            </CardDescription>
                                        </CardHeader>
                                    </Card>
                                </div>
                                <div className="flex justify-end gap-5 h-full mt-10 items-end">
                                    <Link
                                        href={`/dashboard/commissions/${commission.slug}`}
                                        className="btn btn-outline btn-accent"
                                    >
                                        <EyeIcon className="w-6 h-6" />
                                        View
                                    </Link>
                                    <Link
                                        href={`/dashboard/commissions/${commission.slug}/update`}
                                        className="btn btn-primary text-white"
                                    >
                                        <PencilIcon className="w-6 h-6" />
                                        Edit
                                    </Link>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </DashboardContainer>
    )
}
