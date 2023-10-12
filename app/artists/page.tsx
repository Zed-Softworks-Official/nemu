import React from "react";

import DefaultPageLayout from "@/app/(default)/layout";
import ArtistApplyButton from "@/components/ArtistVerification/ArtistApplyButton";
import ArtistPoints from "@/components/ArtistVerification/ArtistPoints";

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
                <ArtistPoints />
                <hr className="seperation" />
            </main>
        </DefaultPageLayout>
        
    )
}