import { currentUser } from '@clerk/nextjs/server'
import { and, eq, or } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'
import { notFound } from 'next/navigation'
import ImageViewer from '~/components/ui/image-viewer'
import { db } from '~/server/db'
import { forms, requests } from '~/server/db/schema'
import CommissionContent from './commission-content'
import { type ClientCommissionItem, RequestStatus } from '~/core/structures'

const get_form = unstable_cache(
    async (form_id: string) => {
        return await db.query.forms.findFirst({
            where: eq(forms.id, form_id)
        })
    },
    ['commission_form'],
    {
        tags: ['form'],
        revalidate: 3600
    }
)

const get_user_requested = unstable_cache(
    async (form_id: string, user_id?: string) => {
        if (!user_id) {
            return undefined
        }

        const request = await db.query.requests.findFirst({
            where: and(
                eq(requests.user_id, user_id),
                eq(requests.form_id, form_id),
                or(
                    eq(requests.status, RequestStatus.Pending),
                    eq(requests.status, RequestStatus.Accepted)
                )
            )
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
    if (!props.commission) {
        return notFound()
    }

    const user_promise = currentUser()
    const form_data = get_form(props.commission.form_id ?? '')

    const [user, form] = await Promise.all([user_promise, form_data])

    const user_requested = await get_user_requested(
        props.commission.form_id ?? '',
        user?.id
    )

    if (!form) {
        return notFound()
    }

    return (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <ImageViewer images={props.commission.images} />
            <div className="col-span-2 rounded-lg bg-background shadow-xl">
                <CommissionContent
                    commission={props.commission}
                    form_data={form}
                    user_requested={user_requested}
                />
            </div>
        </div>
    )
}
