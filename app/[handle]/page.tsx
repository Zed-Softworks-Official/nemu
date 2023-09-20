import React from "react";
import { notFound } from "next/navigation";
import Image from "next/image"

import prisma from "@/prisma/prisma";
import ArtistProfileTabs from "@/components/ArtistPage/Tabs";

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
            <div className="mx-auto lg:max-w-[130rem] md:max-w-[30rem] h-96 bg-[url('/curved0.jpg')] rounded-3xl bg-no-repeat bg-center bg-cover">
            </div>
            <div className="mx-auto max-w-[120rem] -my-28 py-20 backdrop-blur-xl bg-fullwhite/60 shadow-lg rounded-3xl px-10">
                <div className="flex justify-start">
                    <div>
                        <Image src="/2eb4f4a30934c1948546215fd138f7de.png" alt="Profile Photo" width={100} height={100} className="rounded-3xl ml-10 inline-flex" />
                    </div>
                    <div className="text-left mt-3 px-10">
                        <h2 className="pb-2 font-bold text-2xl">@{artist_info.handle}</h2>
                        <h3 className="text-lg">username</h3>
                    </div>
                </div>
                <div className="absolute end-0 top-28 right-60">
                    <ArtistProfileTabs />
                </div>
            </div>
        </div>
    )
}