import { NemuPrismaClient } from "@/prisma/prisma";
import React from "react";

export default async function ArtistPage({params}: { params: { handle: string}}) {
    let artist_info = await NemuPrismaClient.artist.findFirst({
        where: {
            handle: params.handle
        }
    });

    return (
        <div>
            <h1>{artist_info?.handle}</h1>
        </div>
    )
}