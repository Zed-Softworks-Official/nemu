"use client"

import React from "react";
import useSWR from "swr";

import { SocialIcon } from "react-social-icons";
import { fetcher } from "@/helpers/fetcher";
import { PrismaArtistInfo } from "@/prisma/prisma-interface";
import { PortfolioItem } from "@/helpers/portfolio";

import Image from "next/image";

export default function ArtistBody({artist_info}: {artist_info: PrismaArtistInfo}) {
    let { data } = useSWR('/api/artist/portfolio/' + artist_info.handle + '/' + artist_info.auth0id, fetcher);

    return (
        <div className="grid grid-cols-12 gap-10 xl:max-w-[85%] mx-auto mt-36">
            <div className="bg-fullwhite p-10 rounded-3xl col-span-3 text-center">
                <h1 className="font-bold text-2xl text-center">About</h1>
                <p>{artist_info.about}</p>
                <hr className="w-48 h-1 mx-auto my-4 bg-charcoal border-0 rounded md:my-10"/>
                <div className="my-10">
                    <SocialIcon url="https://twitter.com/JackSchitt404" className="social-icon-scaled"/>
                    <SocialIcon url="https://www.pixiv.net/en/users/29694453" className="social-icon-scaled"/>
                </div>
                <p>Location: {artist_info.location}</p>
                <hr className="w-48 h-1 mx-auto my-4 bg-charcoal border-0 rounded md:my-10"/>
                <h1 className="font-bold text-2xl text-center">Commission Terms</h1>
                <p>{artist_info.terms}</p>
            </div>
            <div className="bg-fullwhite p-10 rounded-3xl col-span-9">
                <h1 className="font-bold text-2xl">Portfolio</h1>
                <img src={data?.portfolio_items[0]?.signed_url} alt="test image" className="rounded-3xl" />
            </div>
        </div>
    )
}