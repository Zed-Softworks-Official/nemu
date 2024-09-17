import type { Metadata } from 'next'
import { Suspense } from 'react'

import CommissionDisplay from '~/components/displays/commission/display'
import Loading from '~/components/ui/loading'
import { get_commission } from '~/server/db/query'

type Props = { params: { handle: string; slug: string } }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const handle = params.handle.substring(3, params.handle.length + 1)
    const commission = await get_commission(handle, params.slug)

    if (!commission) {
        return {}
    }

    const image = commission.images[0]?.url

    if (!image) {
        return {}
    }

    return {
        title: `Nemu | @${handle}`,
        description: `Check out ${handle}'s commission on Nemu!`,
        twitter: {
            title: `Nemu | @${handle}`,
            description: `Check out ${handle}'s commission on Nemu!`,
            images: [image]
        },
        openGraph: {
            images: [image]
        }
    }
}

export default function CommissionsPage({ params }: Props) {
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
