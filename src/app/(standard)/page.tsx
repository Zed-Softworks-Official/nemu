import { clerkClient } from '@clerk/nextjs/server'
import { unstable_cache } from 'next/cache'
import Link from 'next/link'
import { Suspense } from 'react'

import NemuImage from '~/components/nemu-image'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Badge } from '~/components/ui/badge'
import { Card, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import Loading from '~/components/ui/loading'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import type { CommissionAvailability, NemuImageData } from '~/core/structures'

import { get_blur_data } from '~/lib/blur_data'
import { get_availability_badge_data } from '~/lib/utils'
import { db } from '~/server/db'

type RandomArtistReturnType = {
    id: string
    handle: string
    header_photo: string
    about: string
    profile_url: string
}

type RandomCommissionReturnType = {
    id: string
    title: string
    description: string
    featured_image: NemuImageData
    artist_handle: string
    slug: string
    availability: CommissionAvailability
}

const get_random_artists = unstable_cache(
    async () => {
        const artists = await db.query.artists.findMany({
            limit: 10
        })
        const clerk_client = await clerkClient()

        const result: RandomArtistReturnType[] = []
        for (const artist of artists) {
            const user = await clerk_client.users.getUser(artist.user_id)

            result.push({
                id: artist.id,
                handle: artist.handle,
                header_photo: artist.header_photo,
                about: artist.about,
                profile_url: user.imageUrl
            })
        }

        return result
    },
    ['random_artists'],
    { tags: ['random_artists'], revalidate: 3600 }
)

const get_commissions = unstable_cache(
    async () => {
        const commissions = await db.query.commissions.findMany({
            with: {
                artist: true
            },
            orderBy: (commission, { desc }) => [desc(commission.created_at)],
            limit: 10
        })

        const result: RandomCommissionReturnType[] = []
        for (const commission of commissions) {
            result.push({
                id: commission.id,
                title: commission.title,
                description: commission.description,
                featured_image: {
                    url: commission.images[0]!.url,
                    blur_data: await get_blur_data(commission.images[0]!.url)
                },
                artist_handle: commission.artist.handle,
                slug: commission.slug,
                availability: commission.availability as CommissionAvailability
            })
        }

        return result
    },
    ['random_commissions'],
    {
        tags: ['random_comissions'],
        revalidate: 3600
    }
)

export default function Home() {
    return (
        <main className="flex flex-col gap-5">
            <Link
                href={'/artists/apply'}
                className="grid min-h-[300px] w-full grid-cols-1 gap-5 rounded-xl bg-gradient-to-tr from-primary to-primary/80 sm:grid-cols-2"
            >
                <div className="flex h-full flex-col items-center gap-5 p-10 sm:items-start">
                    <h1 className="text-3xl font-bold">Artists Wanted</h1>
                    <p className="max-w-xl text-lg">
                        Join Nemu to showcase your art, connect with a global audience,
                        sell your creations effortlessly, and get commissioned for custom
                        work.
                    </p>
                    <div className="flex h-full items-end">
                        <span className="btn btn-outline">Become An Aritst</span>
                    </div>
                </div>
                <div className="flex h-full w-full grow-0 items-center justify-center pr-10 sm:items-end sm:justify-end">
                    <NemuImage
                        src={'/nemu/artists-wanted.png'}
                        alt="Artists Wanted"
                        width={200}
                        height={200}
                    />
                </div>
            </Link>
            <Tabs defaultValue="commissions">
                <TabsList className="w-full justify-start bg-base-200">
                    <TabsTrigger value="commissions">Commissions</TabsTrigger>
                    <TabsTrigger value="artists">Artists</TabsTrigger>
                </TabsList>
                <TabsContent value="commissions">
                    <Suspense fallback={<Loading />}>
                        <CommissionsList />
                    </Suspense>
                </TabsContent>
                <TabsContent value="artists">
                    <Suspense fallback={<Loading />}>
                        <ArtistsList />
                    </Suspense>
                </TabsContent>
            </Tabs>
        </main>
    )
}

async function ArtistsList() {
    const artists = await get_random_artists()

    return (
        <div className="grid auto-rows-auto grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {artists.map((artist) => (
                <Link href={`/@${artist.handle}`} key={artist.id}>
                    <Card className="animate-pop-in transition-all duration-150 ease-in-out hover:scale-105">
                        <NemuImage
                            src={artist.header_photo}
                            alt={'Header Photo'}
                            className="w-full rounded-t-xl"
                            width={366}
                            height={200}
                        />
                        <div className="ml-5 flex flex-row items-center">
                            <Avatar>
                                <AvatarImage
                                    src={artist.profile_url}
                                    alt="Artist Avatar"
                                />
                                <AvatarFallback>A</AvatarFallback>
                            </Avatar>
                            <CardHeader>
                                <CardTitle>{artist.handle}</CardTitle>
                                <CardDescription>{artist.about}</CardDescription>
                            </CardHeader>
                        </div>
                    </Card>
                </Link>
            ))}
        </div>
    )
}

async function CommissionsList() {
    const commissions = await get_commissions()

    return (
        <div className="grid auto-rows-auto grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {commissions.map((commission) => {
                const [variant, text] = get_availability_badge_data(
                    commission.availability
                )

                return (
                    <Link
                        key={commission.id}
                        href={`/@${commission.artist_handle}/commission/${commission.slug}`}
                    >
                        <Card className="animate-pop-in transition-all duration-150 ease-in-out hover:scale-105">
                            <NemuImage
                                src={commission.featured_image.url}
                                placeholder="blur"
                                blurDataURL={commission.featured_image.blur_data}
                                width={366}
                                height={200}
                                className="w-full rounded-t-xl object-fill"
                                alt={commission.title}
                            />
                            <CardHeader className="flex flex-row justify-between">
                                <div>
                                    <CardTitle>{commission.title}</CardTitle>
                                    <CardDescription>
                                        By @{commission.artist_handle}
                                    </CardDescription>
                                </div>
                                <Badge variant={variant}>{text}</Badge>
                            </CardHeader>
                        </Card>
                    </Link>
                )
            })}
        </div>
    )
}
