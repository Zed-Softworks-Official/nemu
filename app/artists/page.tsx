import Link from 'next/link'

import DefaultPageLayout from '@/app/(default)/layout'
import ArtistLamp from '@/components/artist-verification/artist-lamp'
import ArtistTabs from '@/components/artist-verification/artist-tabs'
import ArtistPoints from '@/components/artist-verification/artist-points'

export default async function Artists() {
    return (
        <DefaultPageLayout>
            <main className="container mx-auto bg-base-300 p-5 rounded-xl text-center">
                <ArtistLamp />
                <ArtistPoints />
                <ArtistTabs />
                <div className='divider'></div>
                <Link href={'/artists/apply'} className="btn btn-primary">
                    Get Verified today!
                </Link>
            </main>
        </DefaultPageLayout>
    )
}
