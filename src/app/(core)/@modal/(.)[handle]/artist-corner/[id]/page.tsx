'use client'

import { useParams } from 'next/navigation'

import ParallelModal from '~/app/_components/ui/parallel-modal'
import { ProductView } from '~/app/_components/product-view'

type RouteParams = {
    handle: string
    id: string
}

export default function ArtistCornerModal() {
    const params = useParams<RouteParams>()

    return (
        <ParallelModal>
            <ProductView
                handle={params.handle.substring(3, params.handle.length)}
                id={params.id}
            />
        </ParallelModal>
    )
}
