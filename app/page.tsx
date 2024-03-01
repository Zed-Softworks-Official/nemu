import DefaultPageLayout from './(default)/layout'
import RandomArtists from '@/components/homepage/random-artists'
import HomepageCarousel from '@/components/homepage/homepage-carousel'

export default function Home() {
    return (
        <DefaultPageLayout>
            <main className="flex flex-wrap container mx-auto">
                <HomepageCarousel />
                <RandomArtists />
            </main>
        </DefaultPageLayout>
    )
}
