import type { Metadata } from 'next'
import { Suspense } from 'react'

import CommissionDisplay from '~/app/(standard)/[handle]/_components/commission-display'
import Loading from '~/components/ui/loading'
import { get_commission } from '~/server/db/query'

type Props = { params: Promise<{ handle: string; slug: string }> }

export async function generateMetadata(props: Props): Promise<Metadata> {
    const params = await props.params
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

export default async function CommissionsPage(props: Props) {
    const params = await props.params
    const handle = params.handle.substring(3, params.handle.length + 1)

    return (
        <div className="flex flex-col gap-5 rounded-lg bg-background-secondary p-5 shadow-xl">
            <div className="flex flex-col gap-5">
                <Suspense fallback={<Loading />}>
                    <CommissionContent handle={handle} slug={params.slug} />
                </Suspense>
            </div>
        </div>
    )
}

async function CommissionContent(props: { handle: string; slug: string }) {
    const commission = await get_commission(props.handle, props.slug)

    return <CommissionDisplay commission={commission} />
}
