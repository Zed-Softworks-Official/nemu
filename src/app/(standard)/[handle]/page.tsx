import { Metadata, ResolvingMetadata } from 'next'
import { notFound } from 'next/navigation'
import { api } from '~/trpc/server'

type Props = {
    params: { handle: string }
}

export async function generateMetadata(
    { params }: Props,
    parent: ResolvingMetadata
): Promise<Metadata> {
    const handle = params.handle.substring(3, params.handle.length + 1)
    const artist = await api.artist.get_artist({ handle })

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
    const artist_data = await api.artist.get_artist({ handle })

    if (!artist_data) {
        return notFound()
    }

    return <pre>{JSON.stringify(artist_data)}</pre>
}
