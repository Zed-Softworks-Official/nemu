'use client'

import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import AutoPlay from 'embla-carousel-autoplay'

import { Button } from '~/app/_components/ui/button'
import { Carousel, CarouselContent, CarouselItem } from '~/app/_components/ui/carousel'
import NemuImage from '~/app/_components/nemu-image'

export function HomeCarousel() {
    return (
        <Carousel
            className="overflow-hidden rounded-xl"
            plugins={[AutoPlay({ delay: 5000, stopOnInteraction: true })]}
            opts={{ loop: true }}
        >
            <CarouselContent>
                <CarouselItem className="bg-primary flex flex-col items-center justify-between p-10 sm:flex-row">
                    <div className="flex flex-col gap-3 pb-10 sm:pb-0">
                        <h2 className="text-xl font-bold">Artists Wanted!</h2>
                        <p className="text-foreground/70 max-w-lg">
                            Join Nemu to showcase your art, connect with a global
                            audience, sell your creations effortlessly, and get
                            commissioned for custom work.
                        </p>
                        <Button
                            asChild
                            variant={'outline'}
                            className="mt-5 w-full bg-transparent hover:bg-transparent/20 sm:w-1/2"
                        >
                            <Link href={'/artists'}>
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
                        loading="eager"
                        priority
                    />
                </CarouselItem>
                <CarouselItem className="bg-primary flex flex-col items-center justify-between p-10 sm:flex-row">
                    <div className="flex flex-col gap-3 pb-10 sm:pb-0">
                        <h2 className="text-xl font-bold">Become A Supporter</h2>
                        <p className="text-foreground/70 max-w-lg">
                            Become a supporter to help fund the development of nemu
                        </p>
                        <Button
                            asChild
                            variant={'outline'}
                            className="mt-5 w-full bg-transparent hover:bg-transparent/20 sm:w-1/2"
                        >
                            <Link href={'/supporter'}>
                                <span>Become a Supporter</span>
                                <ArrowRight className="ml-2 size-4" />
                            </Link>
                        </Button>
                    </div>
                    <NemuImage
                        src={'/nemu/supporter.png'}
                        alt="Become a Supporter"
                        width={200}
                        height={200}
                        loading="eager"
                        priority
                    />
                </CarouselItem>
            </CarouselContent>
        </Carousel>
    )
}
