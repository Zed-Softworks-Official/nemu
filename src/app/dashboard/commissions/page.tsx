import Link from 'next/link'

import { CommissionList, CommissionStats } from './commission-list'
import { Plus } from 'lucide-react'
import { Button } from '~/components/ui/button'

export default function CommissionsDashboardPage() {
    return (
        <div className="container mx-auto px-5 py-10">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-3xl font-bold">My Commissions</h1>
                <Button asChild>
                    <Link
                        href="/dashboard/commissions/create"
                        className="btn btn-primary text-base-content"
                    >
                        <Plus className="h-6 w-6" />
                        New Commission
                    </Link>
                </Button>
            </div>

            <CommissionStats />

            <CommissionList />
        </div>
    )
}
