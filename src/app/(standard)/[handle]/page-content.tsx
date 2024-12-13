'use client'

import { Eye, GlobeIcon } from 'lucide-react'
import NemuImage from '~/components/nemu-image'
import { Button } from '~/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Separator } from '~/components/ui/separator'
import { Skeleton } from '~/components/ui/skeleton'
import { TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { SocialAgent } from '~/lib/structures'
import { cn, format_to_currency } from '~/lib/utils'
import { api } from '~/trpc/react'
import Link from 'next/link'
import { Badge } from '~/components/ui/badge'
import Loading from '~/components/ui/loading'
import { AspectRatio } from '~/components/ui/aspect-ratio'

export function ArtistBanner(props: { handle: string }) {
    const { data: artist, isLoading } = api.artist.get_artist_data.useQuery({
        handle: props.handle
    })

    if (isLoading) {
        return <Skeleton className="h-full w-full" />
    }

    if (!artist?.header_photo) {
        return (
            <NemuImage
                src={'/curved0.jpg'}
                alt="Artist Banner"
                width={1000}
                height={1000}
                className="mx-auto h-96 w-full overflow-hidden rounded-xl object-cover"
            />
        )
    }

    return (
        <NemuImage
            src={artist.header_photo}
            alt="Artist Banner"
            width={1000}
            height={1000}
            className="mx-auto h-96 w-full overflow-hidden rounded-xl object-cover"
        />
    )
}

export function ArtistHeader(props: { handle: string }) {
    const { data: artist, isLoading } = api.artist.get_artist_data.useQuery({
        handle: props.handle
    })

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-between gap-5 lg:flex-row lg:gap-0">
                <div className="flex items-center justify-start">
                    <Skeleton className="h-24 w-24 rounded-full" />
                    <div className="mt-3 px-10 text-left">
                        <Skeleton className="h-8 w-32" />
                        <Skeleton className="mt-2 h-6 w-24" />
                    </div>
                </div>
                <div className="flex items-center">
                    <Skeleton className="h-10 w-48" />
                </div>
            </div>
        )
    }

    return (
        <div className="flex flex-col items-center justify-between gap-5 lg:flex-row lg:gap-0">
            <div className="flex items-center justify-start">
                <div className="avatar relative">
                    {artist?.supporter && (
                        <NemuImage
                            src={'/nemu/supporter.png'}
                            alt="Supporter Image"
                            width={100}
                            height={100}
                            className="absolute -right-4 top-0 !h-10 !w-10"
                        />
                    )}
                    <Avatar className="h-24 w-24">
                        <AvatarImage
                            src={artist?.user.profile_picture}
                            alt="Profile Picture"
                            width={200}
                            height={200}
                        />
                        <AvatarFallback>
                            {artist?.user.username?.substring(0, 2)}
                        </AvatarFallback>
                    </Avatar>
                </div>
                <div className="mt-3 px-10 text-left">
                    <h2 className="pb-2 text-2xl font-bold">@{artist?.handle}</h2>
                    <h3 className="text-lg">{artist?.user.username}</h3>
                </div>
            </div>

            <div className="flex items-center">
                <TabsList>
                    <TabsTrigger value="commissions" defaultChecked>
                        Commissions
                    </TabsTrigger>
                    <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
                </TabsList>
            </div>
        </div>
    )
}

export function ArtistBody(props: { handle: string }) {
    const { data: artist, isLoading } = api.artist.get_artist_data.useQuery({
        handle: props.handle
    })

    if (isLoading) {
        return <Skeleton className="h-full w-full" />
    }

    return (
        <div className="flex flex-col gap-10 lg:mt-36 lg:flex-row">
            <div className="h-fit w-full rounded-xl bg-background-secondary p-10 text-center lg:w-1/3">
                <div className="flex flex-col justify-center gap-5">
                    <div className="flex flex-col">
                        <h2 className="mb-5 font-bold uppercase">About</h2>
                        <Separator className="mb-5 bg-foreground/[0.1]" />
                        <p>{artist?.about}</p>
                        <p className="mt-2">Location: {artist?.location}</p>
                    </div>
                    <div>
                        <Separator className="mb-5 bg-foreground/[0.1]" />
                        <h2 className="mb-5 font-bold uppercase">Socials</h2>
                        <Separator className="mb-5 bg-foreground/[0.1]" />
                        <div className="flex items-center justify-center gap-5">
                            {artist?.socials?.map((social) => (
                                <Button
                                    asChild
                                    variant={'ghost'}
                                    key={social.agent}
                                    className={
                                        'h-12 w-12 rounded-full hover:bg-background-tertiary'
                                    }
                                >
                                    <Link href={social.url} target="_blank">
                                        {get_social_icon(social.agent)}
                                    </Link>
                                </Button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
            <div className="mx-auto flex w-full flex-row gap-10">
                <div className="flex h-full w-full flex-col rounded-xl bg-background-secondary p-10">
                    <TabsContent value="commissions">
                        <h2 className="mb-5 font-bold uppercase">Commissions</h2>
                        <Separator className="mb-5 bg-foreground/[0.1]" />
                        <CommissionsList handle={props.handle} />
                    </TabsContent>
                    <TabsContent value="portfolio">
                        <h2 className="mb-5 font-bold uppercase">Portfolio</h2>
                        <Separator className="mb-5 bg-foreground/[0.1]" />
                        <PortfolioList handle={props.handle} />
                    </TabsContent>
                </div>
            </div>
        </div>
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

function CommissionsList(props: { handle: string }) {
    const { data: artist, isLoading } = api.artist.get_artist_data.useQuery({
        handle: props.handle
    })

    if (isLoading) {
        return <Loading />
    }

    if (!artist?.commissions) {
        return null
    }

    return (
        <ul className="space-y-6">
            {artist.commissions.map((commission) => (
                <li
                    key={commission.id}
                    className="overflow-hidden rounded-lg bg-background shadow"
                >
                    <div className="md:flex">
                        <div className="md:flex-shrink-0">
                            <NemuImage
                                src={commission.images[0]?.url ?? ''}
                                alt={`Preview of ${commission.title}`}
                                width={200}
                                height={200}
                                className="h-48 w-full object-cover md:h-full md:w-48"
                            />
                        </div>
                        <div className="p-6 md:flex-1">
                            <div className="mb-2 flex items-start justify-between">
                                <h2 className="text-xl font-semibold">
                                    {commission.title}
                                </h2>
                                <Badge>{commission.availability}</Badge>
                            </div>
                            <p className="mb-4 text-muted-foreground">
                                {commission.description.substring(
                                    0,
                                    commission.description.length >= 250
                                        ? 250
                                        : commission.description.length
                                )}
                                ...
                            </p>
                            <div className="flex items-center justify-between">
                                <div className="flex flex-col">
                                    <span className="text-lg font-medium uppercase text-muted-foreground">
                                        FROM
                                    </span>
                                    <span className="text-lg font-medium">
                                        {format_to_currency(
                                            Number(commission.price) / 100
                                        )}
                                    </span>
                                </div>
                                <Button size="lg" asChild>
                                    <Link
                                        prefetch={true}
                                        href={`/@${props.handle}/commission/${commission.slug}`}
                                    >
                                        <Eye className="h-6 w-6" />
                                        View
                                    </Link>
                                </Button>
                            </div>
                        </div>
                    </div>
                </li>
            ))}
        </ul>
    )
}

function PortfolioList(props: { handle: string }) {
    const { data: artist, isLoading } = api.artist.get_artist_data.useQuery({
        handle: props.handle
    })

    if (isLoading) {
        return <Loading />
    }

    if (!artist?.portfolio) {
        return null
    }

    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {artist.portfolio.map((portfolio) => (
                <div key={portfolio.id} className="relative overflow-hidden rounded-lg">
                    <AspectRatio ratio={1}>
                        <NemuImage
                            src={portfolio.image.url}
                            alt={portfolio.title}
                            fill
                            className="object-cover transition-transform duration-300 hover:scale-110"
                        />
                    </AspectRatio>
                    <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 to-transparent p-4 opacity-0 transition-opacity duration-300 hover:opacity-100">
                        <h3 className="text-lg font-semibold text-white">
                            {portfolio.title}
                        </h3>
                    </div>
                </div>
            ))}
        </div>
    )
}
