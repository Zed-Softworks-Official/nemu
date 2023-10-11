import React from "react";

import DefaultPageLayout from "@/app/(default)/layout";
import ArtistApplyButton from "@/components/ArtistVerification/ArtistApplyButton";
import { CurrencyDollarIcon } from "@heroicons/react/20/solid";

export default async function Artists() {
    return (
        <DefaultPageLayout>
            <main className="container mx-auto bg-fullwhite dark:bg-fullblack p-5 rounded-3xl text-center">
                <div className="">
                    <h1>Become an Artist on Nemu!</h1>
                    <hr className="seperation" />
                    <p>Something pretty rad goes here or whatever</p>
                    <ArtistApplyButton />
                </div>
                <div className="grid grid-cols-2 gap-10 my-10">
                    <div className="bg-gradient-to-r from-primarylight to-azure p-10 rounded-3xl flex flex-wrap justify-center justify-items-center">
                        <CurrencyDollarIcon className="w-16 h-16 inline-block mr-10" />
                        <h1 className="inline-block font-bold">95/5 Towards Artists</h1>
                    </div>
                    <div className="bg-charcoal p-10 rounded-3xl text-left text-lg">
                        <p>Wow Super Cool</p>
                    </div>
                    <div className="bg-charcoal p-10 rounded-3xl text-left text-lg">
                        <p>Wow Super Cool</p>
                    </div>
                    <div className="bg-gradient-to-r from-primarylight to-azure p-5 rounded-3xl">
                        <h1 className="inline-block font-bold">Built in Kanban, Client Messaging, and SOMETHING</h1>
                    </div>
                    <div className="bg-gradient-to-r from-primarylight to-azure p-5 rounded-3xl">
                        <h1 className="inline-block font-bold">Commission Queues (with a cap)</h1>
                    </div>
                    <div className="bg-charcoal p-10 rounded-3xl text-left text-lg">
                        <p>Wow Super Cool</p>
                    </div>
                </div>
                <hr className="seperation" />
            </main>
        </DefaultPageLayout>
        
    )
}