'use client'

import React, { Suspense } from 'react'

import { notFound } from 'next/navigation'

import Loading from '@/components/loading'
import Portfolio from './portfolio'
import { useTabsContext } from './tabs-context'
import Shop from './shop'
import Commissions from './commissions'
import ArtistSocials from './socials'
import { ArtistPageResponse } from '@/core/responses'

export default function ArtistBody({ data }: { data: ArtistPageResponse }) {
    const { currentIndex } = useTabsContext()

    function RenderBody(index: number) {
        switch (index) {
            case 0:
                return (
                    <>
                        <h1 className="font-bold text-2xl">Commissions</h1>
                        <div className="divider"></div>
                        <Commissions commissions={data.artist?.commissions!} handle={data.artist?.handle!} terms={''} />
                    </>
                )
            case 1:
                return (
                    <>
                        <h1 className="font-bold text-2xl">Store</h1>
                        <div className="divider"></div>
                        <Shop shop_items={data.artist?.products!} handle={data.artist?.handle!} artist_id={data.artist?.id!} />
                    </>
                )
            case 2:
                return (
                    <>
                        <h1 className="font-bold text-2xl">Portfolio</h1>
                        <div className="divider"></div>
                        <Portfolio portfolio_items={data.artist?.portfolio_items!} />
                    </>
                )
            default:
                return notFound()
        }
    }

    return (
        <>
            <div className="flex gap-10 mt-36">
                <div className="bg-base-300 p-10 rounded-xl text-center h-fit w-1/3">
                    <div className="flex flex-col justify-center gap-5">
                        <div className="flex flex-col">
                            <div className="divider card-title">About</div>
                            <p>{data.artist?.about}</p>
                            <p className="mt-10">Location: {data.artist?.location}</p>
                        </div>
                        <ArtistSocials socials={data.artist?.socials!} />
                    </div>
                </div>
                <div className="flex flex-row gap-10 w-full mx-auto">
                    <div className="bg-base-300 p-10 rounded-xl w-full">{RenderBody(currentIndex || 0)}</div>
                </div>
            </div>
        </>
    )
}
