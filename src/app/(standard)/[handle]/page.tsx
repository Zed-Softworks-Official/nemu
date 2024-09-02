import { clerkClient } from '@clerk/nextjs/server'
import { cn } from '~/lib/utils'
import { GlobeIcon } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { notFound } from 'next/navigation'
import { Suspense } from 'react'

import CommissionsList from '~/components/lists/commissions-list'
import PortfolioList from '~/components/lists/portfolio-list'
import NemuImage from '~/components/nemu-image'
import { AspectRatio } from '~/components/ui/aspect-ratio'
import Loading from '~/components/ui/loading'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { SocialAgent } from '~/core/structures'
import { get_artist_data } from '~/server/db/query'

type Props = { params: { handle: string } }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const handle = params.handle.substring(3, params.handle.length + 1)
    const artist = await get_artist_data(handle)

    if (!artist) {
        return {}
    }

    return {
        title: `Nemu | @${artist.handle}`,
        description: `Check out ${artist.handle}'s profile on Nemu!`,
        openGraph: {
            images: [(await clerkClient.users.getUser(artist.user_id)).imageUrl]
        }
    }
}

export default function ArtistPage({ params }: Props) {
    return (
        <Suspense fallback={<Loading />}>
            <PageContent params={params} />
        </Suspense>
    )
}

async function PageContent({ params }: Props) {
    const handle = params.handle.substring(3, params.handle.length + 1)
    const artist_data = await get_artist_data(handle)

    if (!artist_data) {
        return notFound()
    }

    return (
        <Tabs defaultValue="commissions">
            {/* Artist Header */}
            <div className="flex flex-1 flex-col flex-wrap">
                <AspectRatio ratio={12 / 3}>
                    <NemuImage
                        src={artist_data.header.url}
                        alt="Header Photo"
                        width={1000}
                        height={1000}
                        priority
                        placeholder="blur"
                        blurDataURL={artist_data.header.blur_data}
                        className="mx-auto h-96 w-full overflow-hidden rounded-xl object-cover"
                    />
                </AspectRatio>
                <div className="-my-28 mx-auto w-full rounded-xl bg-base-300/60 px-10 py-14 shadow-lg backdrop-blur-xl sm:max-w-[85%]">
                    <div className="flex flex-col items-center justify-between sm:flex-row">
                        <div className="flex items-center justify-start">
                            <div className="avatar relative">
                                {artist_data.supporter && (
                                    <NemuImage
                                        src={'/nemu/supporter.png'}
                                        alt="Supporter Image"
                                        width={100}
                                        height={100}
                                        className="absolute -right-4 top-0 !h-10 !w-10"
                                    />
                                )}
                                <div className="w-24 rounded-full">
                                    <NemuImage
                                        src={artist_data.user.imageUrl}
                                        alt="Profile Photo"
                                        width={200}
                                        height={200}
                                    />
                                </div>
                            </div>
                            <div className="mt-3 px-10 text-left">
                                <h2 className="pb-2 text-2xl font-bold">
                                    @{artist_data.handle}
                                </h2>
                                <h3 className="text-lg">{artist_data.user.username}</h3>
                            </div>
                        </div>
                        <div className="flex items-center">
                            <TabsList>
                                <TabsTrigger value="commissions" defaultChecked>
                                    Commissions
                                </TabsTrigger>
                                {/* <TabsTrigger value="artist-corner">
                                    Artist's Corner
                                </TabsTrigger> */}
                                <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
                            </TabsList>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content Body */}
            <div className="mt-36 flex gap-10">
                <div className="h-fit w-1/3 rounded-xl bg-base-300 p-10 text-center">
                    <div className="flex flex-col justify-center gap-5">
                        <div className="flex flex-col">
                            <div className="divider card-title">About</div>
                            <p>{artist_data.about}</p>
                            <p className="mt-10">Location: {artist_data.location}</p>
                        </div>
                        <div>
                            <div className="divider card-title">Socials</div>
                            <div className="flex items-center justify-center gap-5">
                                {artist_data.socials?.map((social) => (
                                    <Link
                                        key={social.agent}
                                        href={social.url}
                                        className="avatar btn btn-circle btn-ghost rounded-full"
                                        target="_blank"
                                    >
                                        {get_social_icon(social.agent)}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="mx-auto flex w-full flex-row gap-10">
                    <div className="flex h-full w-full flex-col rounded-xl bg-base-300 p-10">
                        <TabsContent value="commissions">
                            <h2 className="card-title">Commissions</h2>
                            <div className="divider"></div>
                            <Suspense fallback={<Loading />}>
                                <CommissionsList
                                    artist_id={artist_data.id}
                                    handle={handle}
                                />
                            </Suspense>
                        </TabsContent>

                        <TabsContent value="portfolio">
                            <h2 className="card-title">Portfolio</h2>
                            <div className="divider"></div>
                            <Suspense fallback={<Loading />}>
                                <PortfolioList artist_id={artist_data.id} />
                            </Suspense>
                        </TabsContent>
                    </div>
                </div>
            </div>
        </Tabs>
    )
}

function get_social_icon(agent: SocialAgent) {
    switch (agent) {
        case SocialAgent.Pixiv:
            return <PixivIcon />
        case SocialAgent.Twitter:
            return <XTwitterIcon />
        case SocialAgent.Website:
            return <GlobeIcon className="h-6 w-6" />
    }
}

interface SocialIconProps {
    className?: string
}

function XTwitterIcon({ className }: SocialIconProps) {
    return (
        <svg
            className={cn('h-6 w-6', className)}
            viewBox="0 0 24 24"
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
        >
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
    )
}

function PixivIcon({ className }: SocialIconProps) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            x="0px"
            y="0px"
            width="100"
            height="100"
            viewBox="0 0 50 50"
            fill="currentColor"
            className={cn('h-6 w-6', className)}
        >
            <path d="M 25 2 C 12.317 2 2 12.317 2 25 C 2 37.683 12.317 48 25 48 C 37.683 48 48 37.683 48 25 C 48 12.317 37.683 2 25 2 z M 26.300781 12.009766 C 35.827781 12.009766 39.291969 18.146531 39.292969 23.269531 C 39.292969 28.539531 34.961781 33.662109 26.300781 33.662109 C 23.332781 33.662109 20.992094 32.832375 19.371094 31.984375 L 19.371094 36.259766 L 20.238281 36.259766 L 20.238281 37.992188 L 15.041016 37.992188 L 15.041016 36.259766 L 15.90625 36.259766 L 15.90625 17.945312 C 14.85625 18.643313 13.308594 20.669922 13.308594 20.669922 L 13.308594 22.070312 L 12.443359 22.070312 L 10.710938 18.939453 C 10.710938 18.939453 16.773781 12.009766 26.300781 12.009766 z M 26.300781 14.164062 C 23.557781 14.164062 21.249094 14.824656 19.371094 15.722656 L 19.371094 29.779297 C 20.524094 30.293297 22.829781 31.064453 26.300781 31.064453 C 31.939781 31.064453 34.962891 26.733531 34.962891 23.269531 C 34.962891 18.920531 32.050781 14.164062 26.300781 14.164062 z"></path>
        </svg>
    )
}
