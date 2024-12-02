'use client'

import { notFound } from 'next/navigation'
import ImageViewer from '~/components/ui/image-viewer'
import Loading from '~/components/ui/loading'
import { api } from '~/trpc/react'
import CommissionContent from './_components/commission-content'

export function CommissionView(props: { handle: string; slug: string }) {
    const { data: commission, isLoading } = api.commission.get_commission.useQuery({
        handle: props.handle,
        slug: props.slug
    })

    if (isLoading) {
        return <Loading />
    }

    if (!commission?.form) {
        return notFound()
    }

    return (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <ImageViewer images={commission.images} />
            <div className="col-span-2 rounded-xl bg-background shadow-xl">
                <CommissionContent
                    commission={commission}
                    form_data={commission.form}
                    user_requested={false}
                />
            </div>
        </div>
    )
}
