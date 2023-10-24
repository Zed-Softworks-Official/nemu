import React from "react";
import type { Metadata, } from 'next'
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";

import { TabsProvider } from "@/components/ArtistPage/TabsContext";
import ArtistHeader from "@/components/ArtistPage/Header";
import ArtistBody from "@/components/ArtistPage/Body";
import DefaultPageLayout from "../(default)/layout";

export var metadata: Metadata = {
    description: 'An Artists Best Friend',
}

export default async function ArtistPage({params}: { params: { handle: string}}) {
    // Get Params from URL
    let handle = params.handle.substring(3, params.handle.length + 1);
    // Set handle to part of the title
    metadata.title = 'Nemu | @' + handle;

    // Get the artist from the handle
    let artist_info = await prisma.artist.findFirst({
        where: {
            handle: handle
        }
    }).catch((error) => {
        console.log(error);
    });

    // If the artist is not found then go to a not found page
    if (!artist_info) {
        notFound();
    }

    // Render View
    return (
        <DefaultPageLayout>
            <TabsProvider>
                <ArtistHeader handle={handle} id={artist_info.userId} />
                <ArtistBody artist_info={artist_info} />
            </TabsProvider>
        </DefaultPageLayout>
    )
}