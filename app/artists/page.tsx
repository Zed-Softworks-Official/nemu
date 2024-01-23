import React from 'react'

import DefaultPageLayout from '@/app/(default)/layout'
import ArtistApplyButton from '@/components/artist-verification/artist-apply-button'
import ArtistPoints from '@/components/artist-verification/artist-points'

export default async function Artists() {
    return (
        <DefaultPageLayout>
            <main className="container mx-auto bg-base-300 p-5 rounded-xl text-center">
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
