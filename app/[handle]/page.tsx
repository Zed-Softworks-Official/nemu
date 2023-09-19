import React from "react";
import { notFound } from 'next/navigation';
import prisma from "@/prisma/prisma";

export default async function ArtistPage({params}: { params: { handle: string}}) {
    let artist_info = await prisma.artist.findFirst({
        where: {
            handle: params.handle
        }
    }).catch((error) => {
        console.log(error);
    });

    if (!artist_info) {
        notFound();
    }

    return (
        <div>
            <div className="mx-auto lg:max-w-[130rem] md:max-w-[30rem] h-96 bg-gradient-to-r from-primary to-azure rounded-lg">
            </div>
            <h1>{artist_info?.handle}</h1>
        </div>
    )
}