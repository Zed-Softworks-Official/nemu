import type { Metadata, ResolvingMetadata } from 'next'

import { AspectRatio } from '~/app/_components/ui/aspect-ratio'

import { Tabs } from '~/app/_components/ui/tabs'
import { api } from '~/trpc/server'
import { ArtistBanner, ArtistHeader, ArtistBody } from './page-content'
import { ArtistPageProvider } from './page-context'

type Props = { params: Promise<{ handle: string }> }

export async function generateMetadata(
    props: Props,
    parent: ResolvingMetadata
): Promise<Metadata> {
    const isArtistRoute = (await parent).title?.absolute.includes('@')

    if (!isArtistRoute) {
        return {}
    }

    const params = await props.params
    const handle = params.handle.substring(3, params.handle.length + 1)

    const artist = await api.artist.getArtistData({ handle })

    if (!artist) {
        return {}
    }

    return {
        title: `Nemu | @${artist.handle}`,
        description: `Check out ${artist.handle}'s profile on Nemu!`,
        twitter: {
            title: `Nemu | @${artist.handle}`,
            description: `Check out ${artist.handle}'s profile on Nemu!`,
            images: [artist.user.profilePicture]
        },
        openGraph: {
            images: [artist.user.profilePicture]
        }
    }
}

export default async function ArtistPage(props: Props) {
    const params = await props.params
    const handle = params.handle.substring(3, params.handle.length + 1)

    return (
        <ArtistPageProvider handle={handle}>
            <Tabs defaultValue="commissions">
                <div className="container mx-auto flex flex-1 flex-col flex-wrap">
                    <AspectRatio ratio={12 / 3}>
                        <ArtistBanner />
                    </AspectRatio>
                    <div className="bg-background-tertiary/70 mx-auto my-28 w-full rounded-xl px-10 py-14 shadow-lg backdrop-blur-xl sm:max-w-[85%] lg:-my-20 lg:py-14 xl:-my-28">
                        <ArtistHeader />
                    </div>
                </div>

                <ArtistBody />
            </Tabs>
        </ArtistPageProvider>
    )
}
