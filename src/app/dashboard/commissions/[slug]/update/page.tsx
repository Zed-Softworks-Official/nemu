import { currentUser, User } from '@clerk/nextjs/server'
import { eq } from 'drizzle-orm'
import { notFound, redirect } from 'next/navigation'
import { Suspense } from 'react'

import CommissionCreateEditForm from '~/components/dashboard/forms/commission-create-edit'
import UploadThingProvider from '~/components/files/uploadthing-context'
import DashboardContainer from '~/components/ui/dashboard-container'
import Loading from '~/components/ui/loading'
import { ClientCommissionItemEditable, CommissionAvailability } from '~/core/structures'
import { format_for_image_editor } from '~/lib/server-utils'
import { db } from '~/server/db'
import { commissions } from '~/server/db/schema'
import { get_form_list } from '~/app/dashboard/commissions/create/page'

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
        price: Number(commission.price),

        form_id: commission.form_id,

        availability: commission.availability as CommissionAvailability,
        slug: commission.slug,
        published: commission.published,

        images: await format_for_image_editor(commission?.images),

        max_commissions_until_closed: commission.max_commissions_until_closed,
        max_commissions_until_waitlist: commission.max_commissions_until_waitlist
    } satisfies ClientCommissionItemEditable
}

export default function UpdateCommissionPage({ params }: { params: { slug: string } }) {
    return (
        <Suspense fallback={<Loading />}>
            <PageContent slug={params.slug} />
        </Suspense>
    )
}

async function PageContent(props: { slug: string }) {
    const user = await currentUser()

    if (!user) {
        return redirect('/u/login')
    }

    const edit_data = await get_edit_data(user, props.slug)
    const forms = await get_form_list(user.privateMetadata.artist_id as string)

    if (!edit_data) {
        return notFound()
    }

    return (
        <DashboardContainer title={`Update ${edit_data?.title}`}>
            <UploadThingProvider
                endpoint="commissionImageUploader"
                edit_previews={edit_data?.images}
            >
                <CommissionCreateEditForm forms={forms} edit_data={edit_data} />
            </UploadThingProvider>
        </DashboardContainer>
    )
}
