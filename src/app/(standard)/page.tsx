import { clerkClient, User } from '@clerk/nextjs/server'
import { InferSelectModel } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'
import Link from 'next/link'
import { Suspense } from 'react'

import NemuImage from '~/components/nemu-image'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Badge } from '~/components/ui/badge'
import Loading from '~/components/ui/loading'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { CommissionAvailability, NemuImageData } from '~/core/structures'
import { get_blur_data } from '~/lib/blur_data'
import { get_availability_badge_data } from '~/lib/utils'
import { db } from '~/server/db'
import { artists, portfolios } from '~/server/db/schema'

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

const get_commissions = unstable_cache(
    async () => {
        const commissions = await db.query.commissions.findMany({
            with: {
                artist: true
            },
            orderBy: (commission, { desc }) => [desc(commission.created_at)]
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
                artist_handle: commissions[i]?.artist.handle!,
                slug: commissions[i]?.slug!,
                availability: commissions[i]?.availability as CommissionAvailability
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

const get_random_portfolio = unstable_cache(
    async () => {
        const portfolio = await db.query.portfolios.findMany({
            with: {
                artist: true
            }
        })

        const result: RandomPortfolioReturnType[] = []
        for (let i = 0; i < portfolio.length; i++) {
            result.push({
                id: portfolio[i]?.id!,
                image: {
                    url: portfolio[i]?.image_url!,
                    blur_data: await get_blur_data(portfolio[i]?.image_url!)
                },
                artist: portfolio[i]?.artist!
            })
        }

        return result
    },
    ['random_portfolio'],
    {
        tags: ['random_portfolio'],
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
                            src={commission.featured_image.url!}
                            alt="Commission Image"
                            width={200}
                            height={200}
                            className="w-full rounded-xl"
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
                        src={portfolio.image.url!}
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
