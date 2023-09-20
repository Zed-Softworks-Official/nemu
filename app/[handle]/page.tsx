import React from "react";
import type { Metadata, } from 'next'
import { notFound } from "next/navigation";

import { PrismaClient } from "@prisma/client";

import ArtistHeader from "@/components/ArtistPage/Header";

export const metadata: Metadata = {
    title: 'Nemu | @ArtistHandle',
    description: 'An Artists Best Friend',
}

export default async function ArtistPage({params}: { params: { handle: string}}) {
    let prisma = new PrismaClient();
    let handle = params.handle.substring(3, params.handle.length + 1);

    let artist_info = await prisma.artist.findFirst({
        where: {
            handle: handle
        }
    }).catch((error) => {
        console.log(error);
    });

    if (!artist_info) {
        notFound();
    }

    prisma.$disconnect();

    // Need Context For Profile Tabs
    // Pass data somehow

    return (
        <ArtistHeader handle={handle} />
    )
}