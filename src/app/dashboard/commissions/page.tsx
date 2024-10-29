import Link from 'next/link'
import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { currentUser } from '@clerk/nextjs/server'

import { EyeIcon, FolderPlusIcon, Paintbrush, Plus } from 'lucide-react'

import NemuImage from '~/components/nemu-image'
import EmptyState from '~/components/ui/empty-state'
import { get_availability_badge_data } from '~/lib/utils'
import DashboardContainer from '~/components/ui/dashboard-container'
import { Badge } from '~/components/ui/badge'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from '~/components/ui/card'

import Loading from '~/components/ui/loading'
import type { ClientCommissionItem } from '~/core/structures'
import { get_commission_list, is_onboarding_complete } from '~/server/db/query'
import CommissionTable from '~/components/dashboard/commission-table'

export default function CommissionsDashboardPage() {
    return (
        <div className="container mx-auto py-10">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-3xl font-bold">My Commissions</h1>
                <Link
                    href="/dashboard/commissions/create"
                    className="btn btn-primary text-base-content"
                >
                    <Plus className="h-6 w-6" />
                    New Commission
                </Link>
            </div>

            <div className="grid gap-6 md:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Total Commissions
                        </CardTitle>
                        <Paintbrush className="text-muted-foreground h-4 w-4" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">12</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Published</CardTitle>
                        <Paintbrush className="text-muted-foreground h-4 w-4" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">8</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Total Requests
                        </CardTitle>
                        <Paintbrush className="text-muted-foreground h-4 w-4" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">42</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            New Requests
                        </CardTitle>
                        <Paintbrush className="text-muted-foreground h-4 w-4" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">23</div>
                    </CardContent>
                </Card>
            </div>

            <Card className="mt-6">
                <CardHeader>
                    <CardTitle>Commission List</CardTitle>
                    <CardDescription>
                        Manage your art commissions and track requests.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Suspense fallback={<Loading />}>
                        <CommissionsView />
                    </Suspense>
                </CardContent>
            </Card>
        </div>
    )
}

async function CommissionsView() {
    const user = await currentUser()

    if (!user) {
        redirect('/u/login')

        return null
    }

    const commissions = await get_commission_list(
        user.privateMetadata.artist_id as string
    )

    if (!commissions || commissions.length === 0) {
        return <>No Commissions Found</>
    }

    return <CommissionTable commissions={commissions} />
}

// async function PageContent() {
//     const user = await currentUser()
//     if (!user) {
//         return notFound()
//     }

//     const commissions = await get_commission_list(
//         user.privateMetadata.artist_id as string
//     )

//     const artist_onboarding_complete = await is_onboarding_complete(
//         user.privateMetadata.artist_id as string
//     )

//     if (!commissions || commissions.length === 0) {
//         return (
//             <DashboardContainer title="Commissions" contentClassName="h-full">
//                 <EmptyState
//                     create_url="/dashboard/commissions/create"
//                     heading="No Commissions Found"
//                     description="Create a new commission to get started"
//                     button_text="Create Commission"
//                     icon={<FolderPlusIcon className="h-10 w-10" />}
//                     disabled={artist_onboarding_complete}
//                 />
//             </DashboardContainer>
//         )
//     }

//     return (
//         <DashboardContainer
//             title="Commissions"
//             addButtonUrl="/dashboard/commissions/create"
//         >
//             <div className="grid grid-cols-1 gap-5">
//                 {commissions.map((commission) => (
//                     <CommissionCard key={commission.slug} commission={commission} />
//                 ))}
//             </div>
//         </DashboardContainer>
//     )
// }

// function CommissionCard({ commission }: { commission: ClientCommissionItem }) {
//     const [variant, text] = get_availability_badge_data(commission.availability)

//     return (
//         <div className="card animate-pop-in bg-base-200 transition-all duration-150 lg:card-side">
//             <figure>
//                 <NemuImage
//                     src={commission.images[0]?.url ?? '/nemu/not-like-this.png'}
//                     placeholder="blur"
//                     blurDataURL={commission.images[0]?.blur_data}
//                     alt={`${commission.title} Featured Image`}
//                     width={200}
//                     height={200}
//                     className="w-full"
//                 />
//             </figure>
//             <div className="card-body">
//                 <h2 className="flex items-center gap-2 text-2xl font-bold">
//                     {commission.title}
//                     <Badge variant={variant} className="badge-lg">
//                         {text}
//                     </Badge>
//                     <Badge
//                         variant={commission.published ? 'default' : 'destructive'}
//                         className="badge-lg"
//                     >
//                         {commission.published ? 'Published' : 'Unpublished'}
//                     </Badge>
//                 </h2>
//                 <div className="divider"></div>
//                 <div className="grid grid-cols-2 gap-5">
//                     <Card>
//                         <CardHeader>
//                             <CardTitle>Total Requests</CardTitle>
//                             <CardDescription>{commission.total_requests}</CardDescription>
//                         </CardHeader>
//                     </Card>
//                     <Card>
//                         <CardHeader>
//                             <CardTitle>New Requests</CardTitle>
//                             <CardDescription>{commission.new_requests}</CardDescription>
//                         </CardHeader>
//                     </Card>
//                 </div>
//                 <div className="mt-10 flex h-full items-end justify-end gap-5">
//                     <Link
//                         href={`/dashboard/commissions/${commission.slug}`}
//                         className="btn btn-primary btn-wide text-white"
//                     >
//                         <EyeIcon className="h-6 w-6" />
//                         View Commission
//                     </Link>
//                 </div>
//             </div>
//         </div>
//     )
// }
