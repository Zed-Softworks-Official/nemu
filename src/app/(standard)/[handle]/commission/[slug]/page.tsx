import { Suspense } from 'react'
import CommissionDisplay from '~/components/displays/commission/display'
import Loading from '~/components/ui/loading'
import { get_commission } from '~/server/db/query'

export default function CommissionsPage({
    params
}: {
    params: { handle: string; slug: string }
}) {
    const handle = params.handle.substring(3, params.handle.length + 1)

    return (
        <div className="card bg-base-300 shadow-xl">
            <div className="card-body">
                <Suspense fallback={<Loading />}>
                    <PageContent handle={handle} slug={params.slug} />
                </Suspense>
            </div>
        </div>
    )
}

async function PageContent(props: { handle: string; slug: string }) {
    const commission = await get_commission(props.handle, props.slug)

    return <CommissionDisplay commission={commission} />
}
