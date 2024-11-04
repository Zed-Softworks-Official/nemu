import Link from 'next/link'
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { currentUser } from '@clerk/nextjs/server'

import { Paintbrush, Plus } from 'lucide-react'

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from '~/components/ui/card'

import { get_commission_list } from '~/server/db/query'

import Loading from '~/components/ui/loading'
import CommissionTable from '~/components/dashboard/commission-table'

export default function CommissionsDashboardPage() {
    return (
        <div className="container mx-auto px-5 py-10">
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
                        <div className="text-2xl font-bold">0</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Published</CardTitle>
                        <Paintbrush className="text-muted-foreground h-4 w-4" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">0</div>
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
                        <div className="text-2xl font-bold">0</div>
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
                        <div className="text-2xl font-bold">0</div>
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
