import Link from 'next/link'
import { Suspense } from 'react'

import NemuImage from '~/components/nemu-image'
import Loading from '~/components/ui/loading'
import { HomeCarousel } from './carousel'

import { api } from '~/trpc/server'

export default function HomePage() {
    return (
        <div className="container mx-auto">
            <HomeCarousel />

            <Suspense
                fallback={
                    <div className="flex flex-1 items-center justify-center">
                        <Loading />
                    </div>
                }
            >
                <RandomCommissions />
            </Suspense>
        </div>
    )
}

async function RandomCommissions() {
    const random_commissions = await api.home.random_commissions()

    return (
        <div className="mt-10 columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">
            {random_commissions.map((commission) => (
                <div
                    key={commission.id}
                    className="mb-4 break-inside-avoid rounded-lg border bg-card p-4 shadow-sm"
                >
                    <Link
                        prefetch={true}
                        scroll={false}
                        href={`/@${commission.artist.handle}/commission/${commission.slug}`}
                    >
                        <div className="aspect-square w-full overflow-hidden rounded-md">
                            <NemuImage
                                src={commission.featured_image}
                                alt={commission.title}
                                width={400}
                                height={400}
                                className="h-full w-full object-cover"
                            />
                        </div>
                        <div className="mt-4">
                            <h3 className="font-medium">{commission.title}</h3>
                            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                                {commission.description}
                            </p>
                            <div className="mt-2 flex items-center justify-between">
                                <span className="text-sm font-medium">
                                    {commission.price}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    by @{commission.artist.handle}
                                </span>
                            </div>
                        </div>
                    </Link>
                </div>
            ))}
        </div>
    )
}
