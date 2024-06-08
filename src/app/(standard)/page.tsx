import { clerkClient, User } from '@clerk/nextjs/server'
import { InferSelectModel } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'
import Link from 'next/link'
import { Suspense } from 'react'

import NemuImage from '~/components/nemu-image'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import Loading from '~/components/ui/loading'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { db } from '~/server/db'
import { artists } from '~/server/db/schema'

type RandomArtistReturnType = InferSelectModel<typeof artists> & { user: User }

const get_random_artists = unstable_cache(
    async () => {
        const artists = await db.query.artists.findMany()

        const result: RandomArtistReturnType[] = []
        for (let i = 0; i < artists.length; i++) {
            result.push({
                ...artists[i]!,
                user: await clerkClient.users.getUser(artists[i]!.user_id)
            })
        }

        return result
    },
    ['random-artists'],
    { tags: ['random-artists'] }
)

export default function Home() {
    return (
        <main className="flex flex-col gap-5">
            <Link
                href={'/artists/apply'}
                className="flex h-[300px] w-full flex-row justify-between gap-5 rounded-xl bg-gradient-to-tr from-primary to-primary/80"
            >
                <div className="flex h-full flex-col gap-5 p-10">
                    <h1 className="text-3xl font-bold">Artists Wanted</h1>
                    <p className="text-lg">Placeholder Copy</p>
                    <div className="flex h-full items-end">
                        <span className="btn btn-outline">Become An Aritst</span>
                    </div>
                </div>
                <div className="flex h-full grow-0 items-end justify-end pr-10">
                    <NemuImage
                        src={'/nemu/artists-wanted.png'}
                        alt="Artists Wanted"
                        width={200}
                        height={200}
                        className=""
                    />
                </div>
            </Link>
            <Tabs defaultValue="all">
                <TabsList className="w-full justify-start bg-base-200">
                    <TabsTrigger value="all">All</TabsTrigger>
                    <TabsTrigger value="artists">Artists</TabsTrigger>
                    <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
                    <TabsTrigger value="commissions">Commissions</TabsTrigger>
                </TabsList>
                <TabsContent value="all">
                    <>All</>
                </TabsContent>
                <TabsContent value="artists">
                    <Suspense fallback={<Loading />}>
                        <ArtistsList />
                    </Suspense>
                </TabsContent>
                <TabsContent value="portfolio"></TabsContent>
                <TabsContent value="commissisons"></TabsContent>
            </Tabs>
        </main>
    )
}

async function ArtistsList() {
    const artists = await get_random_artists()

    return (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {artists.map((artist) => (
                <Link
                    href={`/@${artist.handle}`}
                    className="card animate-pop-in bg-base-200 transition-all duration-150 ease-in-out active:scale-95"
                    key={artist.id}
                >
                    <figure>
                        <NemuImage
                            src={artist.header_photo}
                            alt="Artist Header Image"
                            width={200}
                            height={200}
                            className="w-full"
                        />
                    </figure>
                    <div className="card-body relative">
                        <Avatar className="absolute -top-5">
                            <AvatarImage src={artist.user.imageUrl} alt="Artist Avatar" />
                            <AvatarFallback>A</AvatarFallback>
                        </Avatar>
                        <h1 className="text-2xl font-bold">{artist.handle}</h1>
                        <p>{artist.about}</p>
                    </div>
                </Link>
            ))}
        </div>
    )
}
