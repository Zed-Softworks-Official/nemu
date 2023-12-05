import type { Metadata, ResolvingMetadata } from 'next'
import { notFound } from 'next/navigation'

import { prisma } from '@/lib/prisma'

import DefaultPageLayout from '../(default)/layout'
import { TabsProvider } from '@/components/artist-page/tabs-context'
import ArtistPageClient from '@/components/artist-page/artist-page'

type Props = {
    params: { handle: string }
}

export async function generateMetadata(
    { params }: Props,
    parent: ResolvingMetadata
): Promise<Metadata> {
    // read route params
    const handle = params.handle.substring(3, params.handle.length + 1)

    return {
        title: `Nemu | @${handle}`
    }
}

export default async function ArtistPage({ params }: { params: { handle: string } }) {
    // Get Params from URL
    const handle = params.handle.substring(3, params.handle.length + 1)

    // Get the artist from the handle
    const artist_info = await prisma.artist
        .findFirst({
            where: {
                handle: handle
            }
        })
        .catch((error) => {
            console.log(error)
        })

    // If the artist is not found then go to a not found page
    if (!artist_info) {
        return notFound()
    }

    // Render View
    return (
        <DefaultPageLayout>
            <TabsProvider>
                <ArtistPageClient id={artist_info.userId} />
            </TabsProvider>
        </DefaultPageLayout>
    )
}
