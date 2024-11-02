import { currentUser, type User } from '@clerk/nextjs/server'
import { eq } from 'drizzle-orm'
import { notFound, redirect } from 'next/navigation'
import { Suspense } from 'react'

import { CommissionUpdateForm } from '~/components/dashboard/forms/commission-form'
import UploadThingProvider from '~/components/files/uploadthing-context'
import DashboardContainer from '~/components/ui/dashboard-container'
import Loading from '~/components/ui/loading'
import type {
    ClientCommissionItemEditable,
    CommissionAvailability
} from '~/core/structures'
import { format_for_image_editor } from '~/lib/server-utils'
import { db } from '~/server/db'
import { get_form_list } from '~/server/db/query'
import { commissions } from '~/server/db/schema'

async function get_edit_data(user: User, slug: string) {
    // Get the commission from the db
    const commission = await db.query.commissions.findFirst({
        where: eq(commissions.slug, slug),
        with: {
            artist: true
        }
    })

    if (!commission) {
        return undefined
    }

    // Format for client
    return {
        id: commission.id,
        title: commission.title,
        description: commission.description,
        price: commission.price,

        form_id: commission.form_id,

        availability: commission.availability as CommissionAvailability,
        slug: commission.slug,
        published: commission.published,

        images: await format_for_image_editor(commission?.images),

        max_commissions_until_closed: commission.max_commissions_until_closed,
        max_commissions_until_waitlist: commission.max_commissions_until_waitlist
    } satisfies ClientCommissionItemEditable
}

export default async function UpdateCommissionPage(props: {
    params: Promise<{ slug: string }>
}) {
    const params = await props.params

    return (
        <Suspense fallback={<Loading />}>
            <UpdateForm slug={params.slug} />
        </Suspense>
    )
}

async function UpdateForm(props: { slug: string }) {
    const user = await currentUser()

    if (!user) {
        return redirect('/u/login')
    }

    const commission_data = await get_edit_data(user, props.slug)
    const forms = await get_form_list(user.privateMetadata.artist_id as string)

    if (!commission_data || !forms) {
        return notFound()
    }

    return (
        <UploadThingProvider
            endpoint="commissionImageUploader"
            edit_previews={commission_data.images}
        >
            <CommissionUpdateForm forms={forms} commission_data={commission_data} />
        </UploadThingProvider>
    )
}
