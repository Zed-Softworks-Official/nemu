import React from "react";

import Portfolio from "@/components/ArtistPage/Portfolio";

import { getSession } from "@auth0/nextjs-auth0";
import prisma from "@/prisma/prisma";

export default async function PortfolioComponent() {
    const session = await getSession();

    let artist_info = await prisma.artist.findFirst({
        where: {
            auth0id: session!.user!.sub
        }
    });

    return (
        <main className="flex flex-wrap py-14">
            <div className="bg-fullblack p-10 mx-auto rounded-3xl">
                <h2>Portfolio</h2>
                <p>{artist_info!.handle}</p>
            </div>
        </main>
    )
}