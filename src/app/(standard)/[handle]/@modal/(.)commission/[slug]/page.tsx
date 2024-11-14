import { Suspense } from 'react'
import Loading from '~/components/ui/loading'
import ParallelModal from '~/components/ui/parallel-modal'
import CommissionDisplay from '~/app/(standard)/[handle]/_components/commission-display'
import { get_commission } from '~/server/db/query'

export default async function CommissionModal(props: {
    params: Promise<{ handle: string; slug: string }>
}) {
    const params = await props.params
    const handle = params.handle.substring(3, params.handle.length + 1)

    return (
        <ParallelModal>
            <Suspense fallback={<Loading />}>
                <CommissionContent handle={handle} slug={params.slug} />
            </Suspense>
        </ParallelModal>
    )
}

async function CommissionContent(props: { handle: string; slug: string }) {
    const commission = await get_commission(props.handle, props.slug)

    return <CommissionDisplay commission={commission} />
}
