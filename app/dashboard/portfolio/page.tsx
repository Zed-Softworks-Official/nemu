'use client'

import React from "react";
import useSWR from "swr";
import Link from 'next/link';

import { useDashboardContext } from "@/components/Navigation/Dashboard/DashboardContext";
import { PortfolioItem } from "@/helpers/portfolio";
import { fetcher } from "@/helpers/fetcher";

import { PlusCircleIcon } from "@heroicons/react/20/solid";

export default function PortfolioComponent() {
    const { handle, id } = useDashboardContext();
    const { data } = useSWR(`/api/artist/items/${handle}/portfolio/${id}`, fetcher);

    return (
        <main className="py-14 justify-around mr-24 ml-[26rem]">
            <div className="dark:bg-fullblack bg-fullwhite p-10 mx-auto rounded-3xl">
                <div className="pb-10">
                    <h1 className="font-bold text-2xl text-center">Portfolio</h1>
                    <div className="absolute bottom-20 right-20">
                        <Link href={'/dashboard/portfolio/add'} className="bg-gradient-to-r from-primarylight to-primary/80 px-5 py-10 rounded-3xl hover:from-primarylight/80 hover:to-primary/60">
                            <PlusCircleIcon className="w-14 h-14 inline " />
                        </Link>
                    </div>
                    <hr className="seperation" />
                </div>
                <div className="grid grid-cols-4">
                    {data?.portfolio_items.map( (item: PortfolioItem) => {
                        return (
                            <Link href={`/dashboard/portfolio/item/${item.key}`} key={item.key}>
                                <div className="w-fit h-fit m-5 dark:bg-charcoal bg-white rounded-3xl pb-5">
                                    <img src={item.signed_url} className="rounded-3xl rounded-b-none" />
                                    <div className="pt-5">
                                        <h2 className="text-center font-bold text-2xl">{item.name}</h2>
                                    </div>
                                </div>
                            </Link>
                        )
                    } )}
                </div>
            </div>
        </main>
    )
}