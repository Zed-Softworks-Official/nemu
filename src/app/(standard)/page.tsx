import { clerkClient, type User } from '@clerk/nextjs/server'
import type { InferSelectModel } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'
import Link from 'next/link'
import { Suspense } from 'react'

import NemuImage from '~/components/nemu-image'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Badge } from '~/components/ui/badge'
import Loading from '~/components/ui/loading'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import type { CommissionAvailability, NemuImageData } from '~/core/structures'
import { get_blur_data } from '~/lib/blur_data'
import { get_availability_badge_data } from '~/lib/utils'
import { db } from '~/server/db'
import type { artists } from '~/server/db/schema'

type RandomArtistReturnType = InferSelectModel<typeof artists> & { user: User }
type RandomCommissionReturnType = {
    id: string
    title: string
    description: string
    featured_image: NemuImageData
    artist_handle: string
    slug: string
    availability: CommissionAvailability
}

type RandomPortfolioReturnType = {
    id: string
    image: NemuImageData
    artist: InferSelectModel<typeof artists>
}

const get_random_artists = unstable_cache(
    async () => {
        const artists = await db.query.artists.findMany()
        const clerk_client = await clerkClient()

        const result: RandomArtistReturnType[] = []
        for (const artist of artists) {
            result.push({
                ...artist,
                user: await clerk_client.users.getUser(artist.user_id)
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
            orderBy: (commission, { desc }) => [desc(commission.created_at)]
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

const get_random_portfolio = unstable_cache(
    async () => {
        const portfolio = await db.query.portfolios.findMany({
            with: {
                artist: true
            }
        })

        if (!portfolio) {
            return []
        }

        const result: RandomPortfolioReturnType[] = []
        for (const item of portfolio) {
            result.push({
                id: item.id,
                image: {
                    url: item.image_url,
                    blur_data: await get_blur_data(item.image_url)
                },
                artist: item.artist
            })
        }

        return result
    },
    ['random_portfolio'],
    { tags: ['random_portfolio'], revalidate: 3600 }
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
                <TabsContent value="portfolio">
                    <Suspense fallback={<Loading />}>
                        <PortfolioList />
                    </Suspense>
                </TabsContent>
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
    const commissions = await get_commissions()

    return (
        <div
            className={'columns-1 gap-5 space-y-5 sm:columns-3 lg:columns-4 xl:columns-5'}
        >
            {commissions.map((commission) => {
                const [variant, text] = get_availability_badge_data(
                    commission.availability
                )

                return (
                    <Link
                        key={commission.id}
                        href={`/@${commission.artist_handle}/commission/${commission.slug}`}
                        className="relative flex animate-pop-in flex-col overflow-hidden rounded-xl transition-all duration-200 ease-in-out active:scale-95"
                    >
                        <span className="badge badge-primary badge-lg absolute left-5 top-5 text-white">
                            @{commission.artist_handle}
                        </span>
                        <NemuImage
                            src={commission.featured_image.url}
                            alt="Commission Image"
                            width={200}
                            height={200}
                            className="w-full rounded-xl rounded-b-none"
                            placeholder="blur"
                            blurDataURL={commission.featured_image.blur_data}
                        />
                        <div className="flex flex-col gap-5 bg-base-300 p-5">
                            <div className="flex flex-row gap-3">
                                <h1 className="text-2xl font-bold">{commission.title}</h1>
                                <Badge variant={variant} className="badge-lg">
                                    {text}
                                </Badge>
                            </div>
                        </div>
                    </Link>
                )
            })}
        </div>
    )
}

async function PortfolioList() {
    const portfolio = await get_random_portfolio()

    return (
        <div className="columns-1 gap-5 space-y-5 sm:columns-3 lg:columns-4 xl:columns-5">
            {portfolio.map((portfolio) => (
                <Link
                    key={portfolio.id}
                    href={`/@${portfolio.artist.handle}`}
                    className="flex animate-pop-in rounded-xl transition-all duration-200 ease-in-out"
                >
                    <NemuImage
                        src={portfolio.image.url}
                        alt="Portfolio Image"
                        width={200}
                        height={200}
                        className="w-full rounded-xl"
                        placeholder="blur"
                        blurDataURL={portfolio.image.blur_data}
                    />
                </Link>
            ))}
        </div>
    )
}
