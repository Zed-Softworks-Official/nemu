import Link from 'next/link'
import { Suspense } from 'react'
import { Plus } from 'lucide-react'
import { redirect } from 'next/navigation'
import { currentUser } from '@clerk/nextjs/server'

import { get_form_list } from '~/server/db/query'

import Loading from '~/components/ui/loading'
import CommissionFormsTable from '~/components/dashboard/commission-forms-table'

export default function FormsDashboardPage() {
    return (
        <div className="container mx-auto px-5 py-10">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-3xl font-bold">Forms</h1>
                <Link
                    href="/dashboard/forms/create"
                    className="btn btn-primary text-base-content"
                >
                    <Plus className="h-6 w-6" />
                    New Form
                </Link>
            </div>

            <Suspense fallback={<Loading />}>
                <FormsList />
            </Suspense>
        </div>
    )
}

async function FormsList() {
    const user = await currentUser()

    if (!user) {
        return redirect('/u/login')
    }

    const forms_list = await get_form_list(user.privateMetadata.artist_id as string)

    if (!forms_list || forms_list.length === 0) {
        return <>No Forms Found</>
    }

    return <CommissionFormsTable forms={forms_list} />
}
