import React from "react";
import type { Metadata, } from 'next'
import { notFound } from "next/navigation";

import { PrismaClient } from "@prisma/client";

import ArtistHeader from "@/components/ArtistPage/Header";
import ArtistBody from "@/components/ArtistPage/Body";

export var metadata: Metadata = {
    title: 'Nemu | @',
    description: 'An Artists Best Friend',
}

export default async function ArtistPage({params}: { params: { handle: string}}) {
    // Create new prisma client and get the handle from the params
    let prisma = new PrismaClient();
    let handle = params.handle.substring(3, params.handle.length + 1);

    // Set handle to part of the title
    metadata.title += handle;

    console.log(handle);

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

    // Destroy Prisma client
    prisma.$disconnect();

    // Need Context For Profile Tabs
    // Pass data somehow

    // Render View
    return (
        <div>
            <ArtistHeader handle={handle} id={artist_info!.auth0id!} />
            <ArtistBody artist_info={artist_info} />
        </div>
    )
}