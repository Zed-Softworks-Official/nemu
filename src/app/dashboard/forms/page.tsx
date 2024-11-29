import Link from 'next/link'
import { Plus } from 'lucide-react'

import { Button } from '~/components/ui/button'
import RequestFormsList from './request-forms-list'

export default function RequestFormsPage() {
    return (
        <div className="container mx-auto px-5 py-10">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-3xl font-bold">My Forms</h1>
                <Button asChild>
                    <Link
                        href="/dashboard/request-forms/create"
                        className="btn btn-primary text-base-content"
                    >
                        <Plus className="h-6 w-6" />
                        New Form
                    </Link>
                </Button>
            </div>
            <RequestFormsList />
        </div>
    )
}
