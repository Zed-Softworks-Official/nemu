import { clerkClient, User } from '@clerk/nextjs/server'
import { InferSelectModel } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'
import Link from 'next/link'
import { Suspense } from 'react'

import NemuImage from '~/components/nemu-image'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import Loading from '~/components/ui/loading'
import Masonry from '~/components/ui/masonry'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { NemuImageData } from '~/core/structures'
import { get_blur_data } from '~/lib/blur_data'
import { format_to_currency } from '~/lib/utils'
import { db } from '~/server/db'
import { artists } from '~/server/db/schema'

type RandomArtistReturnType = InferSelectModel<typeof artists> & { user: User }
type RandomCommissionReturnType = {
    id: string
    title: string
    description: string
    featured_image: NemuImageData
    price: string
    handle: string
    slug: string
}

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
    ['random_artists'],
    { tags: ['random_artists'], revalidate: 60 }
)

const get_random_commissions = unstable_cache(
    async () => {
        const commissions = await db.query.commissions.findMany({
            with: {
                artist: true
            }
        })

        const result: RandomCommissionReturnType[] = []
        for (let i = 0; i < commissions.length; i++) {
            result.push({
                id: commissions[i]?.id!,
                title: commissions[i]?.title!,
                description: commissions[i]?.description!,
                featured_image: {
                    url: commissions[i]?.images[0]?.url!,
                    blur_data: await get_blur_data(commissions[i]?.images[0]?.url!)
                },
                handle: commissions[i]?.artist.handle!,
                price: format_to_currency(commissions[i]?.price!),
                slug: commissions[i]?.slug!
            })
        }

        return result
    },
    ['random_commissions'],
    {
        tags: ['random_comissions'],
        revalidate: 60
    }
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
            <Tabs defaultValue="commissions">
                <TabsList className="w-full justify-start bg-base-200">
                    <TabsTrigger value="commissions">Commissions</TabsTrigger>
                    <TabsTrigger value="artists">Artists</TabsTrigger>
                    <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
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
                <TabsContent value="portfolio"></TabsContent>
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

async function CommissionsList() {
    const commissions = await get_random_commissions()

    return (
        <div
            className={'columns-1 gap-5 space-y-5 sm:columns-3 lg:columns-4 xl:columns-5'}
        >
            {commissions.map((commission) => (
                <Link
                    key={commission.id}
                    href={`/@${commission.handle}/commission/${commission.slug}`}
                    className="group relative animate-pop-in rounded-xl transition-all duration-150 ease-in-out"
                >
                    <div className="absolute flex h-full w-full flex-col items-center rounded-xl bg-base-300/80 p-5 opacity-0 transition-all duration-200 ease-in-out group-hover:opacity-100">
                        <div>
                            <h1 className="text-2xl font-bold">{commission.title}</h1>
                            <p className="text-base-content/80">
                                {commission.description}
                            </p>
                        </div>
                        <div className="flex h-full items-end justify-start"></div>
                    </div>
                    <NemuImage
                        src={commission.featured_image.url!}
                        alt="Commission Image"
                        width={200}
                        height={200}
                        className="w-full rounded-xl"
                        placeholder="blur"
                        blurDataURL={commission.featured_image.blur_data}
                    />
                </Link>
            ))}
        </div>
    )
}
