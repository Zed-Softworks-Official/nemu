'use client'

import React, { Suspense } from 'react'

import { notFound } from 'next/navigation'
import { SocialIcon } from 'react-social-icons'

import Loading from '@/app/[handle]/loading'
import Portfolio from './portfolio'
import { useTabsContext } from './tabs-context'
import { Artist } from '@prisma/client'
import Shop from './shop'

export default function ArtistBody({ artist_info }: { artist_info: Artist }) {
    const { currentIndex, setCurrentIndex } = useTabsContext()

    function renderCorrectBody(index: number) {
        switch (index) {
            case 0:
                return (
                    <div>
                        <h1 className="font-bold text-2xl">Commission</h1>
                    </div>
                )
            case 1:
                return (
                    <Suspense fallback={<Loading />}>
                        <h1 className="font-bold text-2xl">Store</h1>
                        <Shop user_id={artist_info.userId} />
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
        <div className="grid grid-cols-12 gap-10 xl:max-w-[85%] mx-auto mt-36">
            <div className="bg-fullwhite dark:bg-fullblack p-10 rounded-3xl col-span-3 text-center">
                <h1 className="font-bold text-2xl text-center">About</h1>
                <p>{artist_info.about}</p>
                <hr className="seperation" />
                <div className="my-10">
                    <SocialIcon
                        url="https://twitter.com/JackSchitt404"
                        className="social-icon-scaled"
                        target="_blank"
                    />
                    <SocialIcon
                        url="https://www.pixiv.net/en/users/29694453"
                        className="social-icon-scaled"
                        target="_blank"
                    />
                </div>
                <p>Location: {artist_info.location}</p>
                <hr className="seperation" />
                <h1 className="font-bold text-2xl text-center">Commission Terms</h1>
                <p>{artist_info.terms}</p>
            </div>
            <div className="bg-fullwhite dark:bg-fullblack  p-10 rounded-3xl col-span-9">
                {renderCorrectBody(currentIndex || 0)}
            </div>
        </div>
    )
}
