import { unstable_cache } from 'next/cache'
import { Suspense } from 'react'
import NemuImage from '~/components/nemu-image'
import Loading from '~/components/ui/loading'

const get_featured_artists = unstable_cache(
    async () => {
        return []
    },
    ['featured_artists'],
    {
        tags: ['featured_artists']
    }
)

export default function FeaturedPage() {
    return (
        <main className="flex flex-col gap-5">
            <section className="w-full">
                <div className="container space-y-10 px-4 md:px-6 xl:space-y-16">
                    <div className="mx-auto grid max-w-[1300px] gap-4 px-4 sm:px-6 md:grid-cols-2 md:gap-16 md:px-10">
                        <div>
                            <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl lg:leading-loose xl:text-[3.4rem] 2xl:text-[3.75rem]">
                                Featured Artists
                            </h1>
                            <p className="mx-auto max-w-[700px] text-base-content/80 md:text-xl">
                                Meet the talented artists who brought Nemu to life and
                                helped make it what it is today.
                            </p>
                        </div>
                    </div>
                </div>
                <div className="divider"></div>
            </section>

            <Suspense fallback={<Loading />}>
                <ArtistsList />
            </Suspense>
        </main>
    )
}

async function ArtistsList() {
    const featured_artists = await get_featured_artists()

    return (
        <div className="grid grid-cols-1">
            <div className="card bg-base-200 shadow-xl lg:card-side">
                <figure>
                    <NemuImage
                        src={'/nemu/sparkles.png'}
                        alt="Nemu Sparkles"
                        width={200}
                        height={200}
                        priority
                    />
                </figure>
                <div className="card-body">How did you get here?</div>
            </div>
        </div>
    )
}

/**
TODO: Add to carasoul on homepage
<div className="rounded-xl bg-gradient-to-tr from-primary to-primary/80 p-10 shadow-xl sm:p-10 lg:p-14">
    <div className="flex flex-col items-start justify-between gap-5 sm:flex-row">
        <div className="flex flex-col gap-5">
            <h1 className="text-3xl font-bold">Featured Artists</h1>
            <p>
                These artists have helped make Nemu what it is today. Go check
                them out!
            </p>
        </div>
        <NemuImage
            src={'/nemu/sparkles.png'}
            alt="Featured Artists"
            width={200}
            height={200}
            priority
        />
    </div>
</div>*/
