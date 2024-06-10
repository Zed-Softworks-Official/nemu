import ParallelModal from '~/components/ui/parallel-modal'
import { Suspense } from 'react'
import Loading from '~/components/ui/loading'
import CommissionDisplay from '~/components/displays/commission/display'
import { get_commission } from '~/server/db/query'

export default function CommissionsPage({
    params
}: {
    params: { handle: string; slug: string }
}) {
    const handle = params.handle.substring(3, params.handle.length + 1)

    return (
        <ParallelModal>
            <Suspense fallback={<Loading />}>
                <PageContent handle={handle} slug={params.slug} />
            </Suspense>
        </ParallelModal>
    )
}

async function PageContent(props: { handle: string; slug: string }) {
    const commission = await get_commission(props.handle, props.slug)

    return <CommissionDisplay commission={commission} />
}
