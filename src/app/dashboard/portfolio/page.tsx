import { RedirectToSignIn } from '@clerk/nextjs'
import { currentUser } from '@clerk/nextjs/server'

import { PortfolioList } from './list'
import { Plus } from 'lucide-react'
import { Button } from '~/components/ui/button'
import Link from 'next/link'

export default async function DashboardPortfolioPage() {
    const user = await currentUser()

    if (!user) {
        return <RedirectToSignIn />
    }

    return (
        <div className="container mx-auto px-5 py-10">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-3xl font-bold">My Portfolio</h1>
                <Button asChild>
                    <Link
                        href="/dashboard/portfolio/create"
                        className="btn btn-primary text-base-content"
                    >
                        <Plus className="h-6 w-6" />
                        New Item
                    </Link>
                </Button>
            </div>

            <PortfolioList artist_id={user.privateMetadata.artist_id as string} />
        </div>
    )
}
