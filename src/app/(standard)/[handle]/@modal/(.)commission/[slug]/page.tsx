import ParallelModal from '~/components/ui/parallel-modal'
import { get_commission } from '~/app/(standard)/[handle]/commission/[slug]/page'
import { Suspense } from 'react'
import Loading from '~/components/ui/loading'
import CommissionDisplay from '~/components/displays/commission/display'

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
