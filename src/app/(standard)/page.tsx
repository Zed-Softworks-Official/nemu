import { ArrowRight } from 'lucide-react'
import Link from 'next/link'

import NemuImage from '~/components/nemu-image'
import { Button } from '~/components/ui/button'
import { Carousel, CarouselContent, CarouselItem } from '~/components/ui/carousel'
import { api } from '~/trpc/server'

export default async function HomePage() {
    const random_commissions = await api.home.random_commissions()

    return (
        <div className="container mx-auto">
            <Carousel className="overflow-hidden rounded-xl">
                <CarouselContent>
                    <CarouselItem className="flex flex-col items-center justify-between bg-primary p-10 sm:flex-row">
                        <div className="flex flex-col gap-3 pb-10 sm:pb-0">
                            <h2 className="text-xl font-bold">Artists Wanted!</h2>
                            <p className="max-w-lg text-foreground/70">
                                Join Nemu to showcase your art, connect with a global
                                audience, sell your creations effortlessly, and get
                                commissioned for custom work.
                            </p>
                            <Button
                                asChild
                                variant={'outline'}
                                className="mt-5 w-full bg-transparent hover:bg-transparent/20 sm:w-1/2"
                            >
                                <Link href={'/artists/apply'}>
                                    <span>Join Now</span>
                                    <ArrowRight className="ml-2 h-4 w-4" />
                                </Link>
                            </Button>
                        </div>
                        <NemuImage
                            src="/nemu/artists-wanted.png"
                            alt="Artists Wanted"
                            width={200}
                            height={200}
                        />
                    </CarouselItem>
                </CarouselContent>
            </Carousel>

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
        </div>
    )
}
