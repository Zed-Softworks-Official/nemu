'use client'

import React, { Suspense } from 'react'

import { notFound } from 'next/navigation'

import Loading from '@/components/loading'
import Portfolio from './portfolio'
import { useTabsContext } from './tabs-context'
import { Artist } from '@prisma/client'
import Shop from './shop'
import Commissions from './commissions'
import Link from 'next/link'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPixiv, faXTwitter } from '@fortawesome/free-brands-svg-icons'

export default function ArtistBody({ artist_info }: { artist_info: Artist }) {
    const { currentIndex } = useTabsContext()

    function renderCorrectBody(index: number) {
        switch (index) {
            case 0:
                return (
                    <div>
                        <h1 className="font-bold text-2xl">Commissions</h1>
                        <Commissions
                            user_id={artist_info.userId}
                            terms={artist_info.terms}
                        />
                    </div>
                )
            case 1:
                return (
                    <Suspense fallback={<Loading />}>
                        <h1 className="font-bold text-2xl">Store</h1>
                        <Shop user_id={artist_info.userId} handle={artist_info.handle} />
                    </Suspense>
                )
            case 2:
                return (
                    <Suspense fallback={<Loading />}>
                        <h1 className="font-bold text-2xl">Portfolio</h1>
                        <Portfolio handle={artist_info.handle} id={artist_info.userId} />
                    </Suspense>
                )
            default:
                return notFound()
        }
    }

    return (
        <div className="grid grid-cols-12 gap-10 w-full mx-auto mt-36">
            <div className="bg-base-300 p-10 rounded-xl col-span-3 text-center">
                <div className="flex flex-col justify-center gap-5">
                    <div className="flex flex-col">
                        <div className="divider card-title">About</div>
                        <p>{artist_info.about}</p>
                        <p className="mt-10">Location: {artist_info.location}</p>
                    </div>
                    <div>
                        <div className="divider card-title">Socials</div>
                        <div className="flex gap-5 justify-center items-center">
                            <Link
                                href={`https://twitter.com/JackSchitt404`}
                                className="avatar btn btn-circle btn-ghost rounded-full"
                                target="_blank"
                            >
                                <FontAwesomeIcon icon={faXTwitter} className="w-6 h-6" />
                            </Link>
                            <Link
                                href={`https://www.pixiv.net/en/users/29694453`}
                                className="avatar btn btn-circle btn-ghost rounded-full"
                                target="_blank"
                            >
                                <FontAwesomeIcon icon={faPixiv} className="w-6 h-6" />
                            </Link>
                        </div>
                    </div>
                    <div>
                        <div className="divider card-title">Commission Terms</div>
                        <p>{artist_info.terms}</p>
                    </div>
                </div>
            </div>
            <div className="bg-base-300 p-10 rounded-xl col-span-9">
                {renderCorrectBody(currentIndex || 0)}
            </div>
        </div>
    )
}
