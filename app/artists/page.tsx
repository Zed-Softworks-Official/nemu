import React from 'react'

import DefaultPageLayout from '@/app/(default)/layout'
import ArtistPoints from '@/components/artist-verification/artist-points'
import Link from 'next/link'

export default async function Artists() {
    return (
        <DefaultPageLayout>
            <main className="container mx-auto bg-base-300 p-5 rounded-xl text-center">
                <div className="">
                    <h1>Become an Artist on Nemu!</h1>
                    <p>Something pretty rad goes here or whatever</p>
                    <div className="divider"></div>
                    <Link href={'/artists/apply'} className="btn btn-outline btn-accent">
                        Click here to become an artist
                    </Link>
                </div>
                <ArtistPoints />
            </main>
        </DefaultPageLayout>
    )
}
