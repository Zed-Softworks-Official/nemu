import React from "react";
import { notFound } from "next/navigation";
import Image from "next/image"

import ArtistProfileTabs from "@/components/ArtistPage/Tabs";
import { PrismaClient } from "@prisma/client";

import { GetUser } from "@/helpers/auth0";

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

    let user = await GetUser(artist_info!.auth0id!);

    if (!artist_info) {
        notFound();
    }

    // Need Context For Profile Tabs
    // Pass data somehow

    return (
        <div>
            <div className="mx-auto xl:max-w-[130rem] lg:max-w-[100rem] h-96 bg-[url('/curved0.jpg')] rounded-3xl bg-no-repeat bg-center bg-cover">
            </div>
            <div className="mx-auto xl:max-w-[120rem] lg:max-w-[90rem] -my-28 py-14 backdrop-blur-xl bg-fullwhite/60 shadow-lg rounded-3xl px-10">
                <div className="flex justify-start">
                    <Image src="/2eb4f4a30934c1948546215fd138f7de.png" alt="Profile Photo" width={100} height={100} className="rounded-3xl ml-10 inline-flex" />
                    <div className="text-left mt-3 px-10">
                        <h2 className="pb-2 font-bold text-2xl">@{artist_info.handle}</h2>
                        <h3 className="text-lg">username</h3>
                    </div>
                </div>
                <div className="absolute end-0 top-20 right-60">
                    <ArtistProfileTabs />
                </div>
            </div>
        </div>
    )
}