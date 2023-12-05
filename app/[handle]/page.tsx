import type { Metadata, ResolvingMetadata } from 'next'

import DefaultPageLayout from '../(default)/layout'
import { TabsProvider } from '@/components/artist-page/tabs-context'
import ArtistPageClient from '@/components/artist-page/artist-page'
import { prisma } from '@/lib/prisma'

type Props = {
    params: { handle: string }
}

export async function generateMetadata(
    { params }: Props,
    parent: ResolvingMetadata
): Promise<Metadata> {
    const handle = params.handle.substring(3, params.handle.length + 1)

    const artist = await prisma.artist.findFirst({
        where: {
            handle: handle
        }
    })

    if (!artist) {
        return {}
    }

    return {
        title: `Nemu | @${handle}`
    }
}

export default async function ArtistPage({ params }: { params: { handle: string } }) {
    const handle = params.handle.substring(3, params.handle.length + 1)

    return (
        <DefaultPageLayout>
            <TabsProvider>
                <ArtistPageClient handle={handle} />
            </TabsProvider>
        </DefaultPageLayout>
    )
}
