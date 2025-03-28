'use client'

import { useParams } from 'next/navigation'

import ParallelModal from '~/app/_components/ui/parallel-modal'
import { CommissionView } from '~/app/_components/commission-view'

type RouteParams = {
    handle: string
    slug: string
}

export default function CommissionModal() {
    const params = useParams<RouteParams>()

    return (
        <ParallelModal>
            <CommissionView handle={params.handle} slug={params.slug} />
        </ParallelModal>
    )
}
