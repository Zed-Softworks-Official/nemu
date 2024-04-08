'use client'

import React from 'react'

import { notFound } from 'next/navigation'

import Portfolio from './portfolio'
import { useTabsContext } from './tabs-context'
import Commissions from './commissions'
import ArtistSocials from './socials'
import { ArtistPageResponse } from '@/core/responses'
import dynamic from 'next/dynamic'

const Shop = dynamic(() => import('./shop'))

export default function ArtistBody({ data }: { data: ArtistPageResponse }) {
    const { currentIndex } = useTabsContext()

    function RenderBody(index: number) {
        switch (index) {
            case 0:
                return (
                    <>
                        <h1 className="font-bold text-2xl">Commissions</h1>
                        <div className="divider"></div>
                        <Commissions artist_id={data.id} terms={data.terms} />
                    </>
                )
            case 1:
                return (
                    <>
                        <h1 className="font-bold text-2xl">Artist's Corner</h1>
                        <div className="divider"></div>
                        <Shop handle={data.handle} artist_id={data.id} />
                    </>
                )
            case 2:
                return (
                    <>
                        <h1 className="font-bold text-2xl">Portfolio</h1>
                        <div className="divider"></div>
                        <Portfolio artist_id={data.id} />
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
                            <p>{data?.about}</p>
                            <p className="mt-10">Location: {data?.location}</p>
                        </div>
                        <ArtistSocials socials={data?.socials!} />
                    </div>
                </div>
                <div className="flex flex-row gap-10 w-full mx-auto">
                    <div className="bg-base-300 p-10 rounded-xl w-full h-full flex flex-col">
                        {RenderBody(currentIndex || 0)}
                    </div>
                </div>
            </div>
        </>
    )
}
