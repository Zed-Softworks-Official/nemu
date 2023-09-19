import React from "react";

import { NemuPrismaClient } from "@/prisma/prisma";

export default async function ArtistPage({params}: { params: { handle: string}}) {
    let artist_info = await NemuPrismaClient.artist.findFirst({
        where: {
            handle: params.handle
        }
    }).catch((error) => {
        console.log(error);
    });

    NemuPrismaClient.$disconnect();

    return (
        <div>
            <div className="mx-auto max-w-[130rem] h-96 bg-gradient-to-r from-primary to-azure rounded-lg">
            </div>
            <h1>{artist_info?.handle}</h1>
        </div>
    )
}