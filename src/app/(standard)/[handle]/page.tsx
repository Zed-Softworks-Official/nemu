import { faPixiv, faXTwitter } from '@fortawesome/free-brands-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { GlobeIcon } from 'lucide-react'
import { Metadata, ResolvingMetadata } from 'next'
import Link from 'next/link'

import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import CommissionsList from '~/components/lists/commissions-list'
import NemuImage from '~/components/nemu-image'
import Loading from '~/components/ui/loading'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
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
            <div className="flex flex-wrap flex-1 flex-col">
                <div
                    className="mx-auto w-full h-96 rounded-xl bg-no-repeat bg-center bg-cover"
                    style={{ backgroundImage: `url(${artist_data.headerPhoto})` }}
                ></div>
                <div className="mx-auto sm:max-w-[85%] w-full -my-28 py-14 backdrop-blur-xl bg-base-300/60 shadow-lg rounded-xl px-10">
                    <div className="flex flex-col sm:flex-row justify-between items-center">
                        <div className="flex items-center justify-start">
                            <div className="avatar relative">
                                {artist_data.supporter && (
                                    <NemuImage
                                        src={'/nemu/supporter.png'}
                                        alt="Supporter Image"
                                        width={100}
                                        height={100}
                                        className="absolute !w-10 !h-10 top-0 -right-4"
                                    />
                                )}
                                <div className="w-24 rounded-full">
                                    <NemuImage
                                        src={
                                            artist_data.user.image
                                                ? artist_data.user.image
                                                : '/profile.png'
                                        }
                                        alt="Profile Photo"
                                        width={200}
                                        height={200}
                                    />
                                </div>
                            </div>
                            <div className="text-left mt-3 px-10">
                                <h2 className="pb-2 font-bold text-2xl">
                                    @{artist_data.handle}
                                </h2>
                                <h3 className="text-lg">{artist_data.user.name}</h3>
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
            <div className="flex gap-10 mt-36">
                <div className="bg-base-300 p-10 rounded-xl text-center h-fit w-1/3">
                    <div className="flex flex-col justify-center gap-5">
                        <div className="flex flex-col">
                            <div className="divider card-title">About</div>
                            <p>{artist_data.about}</p>
                            <p className="mt-10">Location: {artist_data.location}</p>
                        </div>
                        <div>
                            <div className="divider card-title">Socials</div>
                            <div className="flex gap-5 justify-center items-center">
                                {artist_data.socials.map((social) => (
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
                <div className="flex flex-row gap-10 w-full mx-auto">
                    <div className="bg-base-300 p-10 rounded-xl w-full h-full flex flex-col">
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
                        </TabsContent>
                    </div>
                </div>
            </div>
        </Tabs>
    )
}

function get_social_icon(agent: string) {
    switch (agent) {
        case 'TWITTER':
            return <FontAwesomeIcon icon={faXTwitter} className="w-6 h-6" />
        case 'PIXIV':
            return <FontAwesomeIcon icon={faPixiv} className="w-6 h-6" />
        default:
            return <GlobeIcon className="w-6 h-6" />
    }
}
