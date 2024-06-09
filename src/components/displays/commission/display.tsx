import { and, eq } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'
import { notFound } from 'next/navigation'
import ImageViewer from '~/components/ui/image-viewer'
import { db } from '~/server/db'
import { forms, requests } from '~/server/db/schema'
import CommissionContent from './content'
import { ClientCommissionItem } from '~/core/structures'
import { currentUser } from '@clerk/nextjs/server'

const get_form = unstable_cache(
    async (form_id: string) => {
        const form = await db.query.forms.findFirst({
            where: eq(forms.id, form_id)
        })

        return form
    },
    ['form'],
    {
        tags: ['form']
    }
)

const get_user_requested = unstable_cache(
    async (form_id: string, user_id?: string) => {
        if (!user_id) {
            return undefined
        }

        const request = await db.query.requests.findFirst({
            where: and(eq(requests.user_id, user_id), eq(requests.form_id, form_id))
        })

        if (!request) {
            return false
        }

        return true
    },
    ['request'],
    {
        tags: ['requests']
    }
)

export default async function CommissionDisplay(props: {
    commission?: ClientCommissionItem
}) {
    const user = await currentUser()

    if (!props.commission) {
        return notFound()
    }

    const form_data = await get_form(props.commission.form_id!)
    const user_requested = await get_user_requested(props.commission.form_id!, user?.id)

    if (!form_data || user_requested === undefined) {
        return notFound()
    }

    return (
        <div className="scrollbar-none grid grid-cols-1 gap-5 md:grid-cols-3">
            <ImageViewer images={props.commission.images} />
            <div className="card col-span-2 bg-base-100 shadow-xl">
                <CommissionContent
                    commission={props.commission}
                    form_data={form_data}
                    user_requested={user_requested}
                />
            </div>
        </div>
    )
}
