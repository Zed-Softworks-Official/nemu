import type { Metadata, ResolvingMetadata } from 'next'

import DefaultPageLayout from '../(default)/layout'
import { TabsProvider } from '@/components/artist-page/tabs-context'
import { api } from '@/core/trpc/server'
import ArtistHeader from '@/components/artist-page/header'
import ArtistBody from '@/components/artist-page/body'

type Props = {
    params: { handle: string }
}

export async function generateMetadata(
    { params }: Props,
    parent: ResolvingMetadata
): Promise<Metadata> {
    const handle = params.handle.substring(3, params.handle.length + 1)
    const artist = await api.artist.get_artist({handle})

    if (!artist) {
        return {}
    }

    return {
        title: `Nemu | @${artist.handle}`,
        description: `Check out ${artist.handle}'s profile on Nemu!`
    }
}

export default async function ArtistPage({ params }: Props) {
    const handle = params.handle.substring(3, params.handle.length + 1)
    const data = await api.artist.get_artist({handle})

    return (
        <DefaultPageLayout>
            <TabsProvider>
                <ArtistHeader data={data} />
                <ArtistBody data={data} />
            </TabsProvider>
        </DefaultPageLayout>
    )
}
