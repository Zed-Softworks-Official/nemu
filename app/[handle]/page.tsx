import React from 'react'

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { prisma } from '@/lib/prisma'

import DefaultPageLayout from '../(default)/layout'
import ArtistBody from '@/components/artist-page/body'
import ArtistHeader from '@/components/artist-page/header'
import { TabsProvider } from '@/components/artist-page/tabs-context'
import SetShopContext from '@/components/artist-page/set-shop-context'

export var metadata: Metadata = {
    description: 'An Artists Best Friend'
}

export default async function ArtistPage({ params }: { params: { handle: string } }) {
    // Get Params from URL
    let handle = params.handle.substring(3, params.handle.length + 1)
    // Set handle to part of the title
    metadata.title = 'Nemu | @' + handle

    // Get the artist from the handle
    const artist_info = await prisma.artist
        .findFirst({
            where: {
                handle: handle
            }
        })
        .catch((error) => {
            console.log(error)
        })

    // If the artist is not found then go to a not found page
    if (!artist_info) {
        return notFound()
    }

    // Render View
    return (
        <DefaultPageLayout>
            <TabsProvider>
                <SetShopContext handle={handle} stripe_account={artist_info.stripeAccId} />
                <ArtistHeader handle={handle} id={artist_info.userId} />
                <ArtistBody artist_info={artist_info} />
            </TabsProvider>
        </DefaultPageLayout>
    )
}
