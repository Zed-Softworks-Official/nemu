'use client'

import Link from 'next/link'
import NemuImage from '../nemu-image'

export default function HomepageCarousel() {
    return (
        <div className="carousel w-full rounded-xl">
            <div id="item1" className="carousel-item w-full">
                <div className="w-full text-white">
                    <Link href={'/artists'} className="w-full">
                        <div className="bg-gradient-to-r from-primary to-azure flex flex-col sm:flex-row justify-between w-full">
                            <div className="inline-block py-10 px-20">
                                <h1>Artists Wanted!</h1>
                                <p>Something Clever Here</p>

                                <button className="mt-20 btn btn-outline btn-accent inline-block">Click Here to become an artist!</button>
                            </div>
                            <div className="flex justify-end items-end">
                                <NemuImage
                                    src={'/nemu/artists-wanted.png'}
                                    alt='Nemu with a sign that says "artists wanted"'
                                    width={350}
                                    height={350}
                                    className="pr-20"
                                />
                            </div>
                        </div>
                    </Link>
                </div>
            </div>
        </div>
    )
}
