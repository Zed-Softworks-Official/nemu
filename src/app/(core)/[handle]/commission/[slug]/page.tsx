import type { Metadata } from 'next'

import { api } from '~/trpc/server'
import { CommissionView } from '~/app/_components/commission-view'

type Props = { params: Promise<{ handle: string; slug: string }> }

export async function generateMetadata(props: Props): Promise<Metadata> {
    const params = await props.params
    const handle = params.handle.substring(3, params.handle.length + 1)
    const commission = await api.commission.getCommission({
        handle,
        slug: params.slug
    })

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
        <div className="bg-background-secondary container mx-auto flex flex-col gap-5 rounded-lg p-5 shadow-xl">
            <div className="flex flex-col gap-5">
                <CommissionView handle={handle} slug={params.slug} />
            </div>
        </div>
    )
}
