import { faPixiv, faXTwitter } from '@fortawesome/free-brands-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { GlobeIcon } from 'lucide-react'
import { Metadata, ResolvingMetadata } from 'next'
import Link from 'next/link'

import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import CommissionsList from '~/components/lists/commissions-list'
import PortfolioList from '~/components/lists/portfolio-list'
import NemuImage from '~/components/nemu-image'
import Loading from '~/components/ui/loading'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { SocialAgent } from '~/core/structures'
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

    return (
        <Tabs defaultValue="commissions">
            {/* Artist Header */}
            <div className="flex flex-1 flex-col flex-wrap">
                <div
                    className="mx-auto h-96 w-full rounded-xl bg-cover bg-center bg-no-repeat"
                    style={{ backgroundImage: `url(${artist_data.header_photo})` }}
                ></div>
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
                                <TabsTrigger value="artist-corner">
                                    Artist's Corner
                                </TabsTrigger>
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
                        <TabsContent value="artist-corner">
                            <h2 className="card-title">Artist's Corner</h2>
                            <div className="divider"></div>
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

function get_social_icon(agent: string) {
    switch (agent) {
        case SocialAgent.Twitter:
            return <FontAwesomeIcon icon={faXTwitter} className="h-6 w-6" />
        case SocialAgent.Pixiv:
            return <FontAwesomeIcon icon={faPixiv} className="h-6 w-6" />
        default:
            return <GlobeIcon className="h-6 w-6" />
    }
}
