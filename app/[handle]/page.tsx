import React from "react";
import type { Metadata, } from 'next'
import { notFound } from "next/navigation";

import { PrismaClient } from "@prisma/client";

import ArtistHeader from "@/components/ArtistPage/Header";
import { SocialIcon } from "react-social-icons";

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
            <div className="grid grid-cols-12 gap-10 xl:max-w-[85%] mx-auto mt-36">
                <div className="bg-fullwhite p-10 rounded-3xl col-span-3 text-center">
                    <h1 className="font-bold text-3xl text-center">About</h1>
                    <p>{artist_info.about}</p>
                    <hr className="w-48 h-1 mx-auto my-4 bg-charcoal border-0 rounded md:my-10"/>
                    <div className="my-10">
                        <SocialIcon url="https://twitter.com/JackSchitt404" className="social-icon-scaled"/>
                        <SocialIcon url="https://www.pixiv.net/en/users/29694453" className="social-icon-scaled"/>
                    </div>
                    <p>Location: {artist_info.location}</p>
                    <hr className="w-48 h-1 mx-auto my-4 bg-charcoal border-0 rounded md:my-10"/>
                    <h1 className="font-bold text-3xl text-center">Commission Terms</h1>
                    <p>{artist_info.terms}</p>
                </div>
                <div className="bg-fullwhite p-10 rounded-3xl col-span-9">
                    <h1 className="font-bold text-3xl">Portfolio</h1>
                </div>
            </div>
        </div>
    )
}