"use client"

import useSWR from "swr";

import Image from "next/image"
import ArtistProfileTabs from "@/components/ArtistPage/Tabs";

import { fetcher } from "@/helpers/fetcher";

export default function ArtistHeader({handle, id}: {handle: string, id: string}) {
    const { data, error } = useSWR('/api/artist/info/' + id, fetcher);

    return  (
        <div className="flex-wrap">
            <div className="mx-auto xl:max-w-[85%] lg:max-w-[100rem] h-96 bg-[url('/curved0.jpg')] rounded-3xl bg-no-repeat bg-center bg-cover">
            </div>
            <div className="mx-20">
                <div className="mx-auto xl:max-w-[84%] lg:max-w-[90rem] -my-28 py-14 backdrop-blur-xl bg-fullwhite/60 shadow-lg rounded-3xl px-10">
                    <div className="flex justify-start">
                        <Image src="/2eb4f4a30934c1948546215fd138f7de.png" alt="Profile Photo" width={100} height={100} className="rounded-3xl ml-10 inline-flex" />
                        <div className="text-left mt-3 px-10">
                            <h2 className="pb-2 font-bold text-2xl">@{handle}</h2>
                            <h3 className="text-lg">{data?.username}</h3>
                        </div>
                    </div>
                    <div className="absolute end-0 top-20 right-60">
                        <ArtistProfileTabs />
                    </div>
                </div>
            </div>
        </div>
    )
}
