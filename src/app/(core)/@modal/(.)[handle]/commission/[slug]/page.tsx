'use client'

import ParallelModal from '~/app/_components/ui/parallel-modal'
import { CommissionView } from '~/app/_components/commission-view'
import { useEffect, useState } from 'react'

export default function CommissionModal(props: {
    params: Promise<{ handle: string; slug: string }>
}) {
    const [params, setParams] = useState<{ handle: string; slug: string } | null>(null)

    useEffect(() => {
        // Resolve params promise
        props.params
            .then((resolvedParams) => {
                setParams(resolvedParams)
            })
            .catch((e) => {
                console.error(e)
            })
    }, [props.params])

    if (!params) return null

    const handle = params.handle.substring(3, params.handle.length + 1)

    return (
        <ParallelModal>
            <CommissionView handle={handle} slug={params.slug} />
        </ParallelModal>
    )
}
