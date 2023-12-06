import Link from 'next/link'
import DefaultPageLayout from './(default)/layout'
import RandomArtists from '@/components/homepage/random-artists'
import Image from 'next/image'

export default function Home() {
    return (
        <DefaultPageLayout>
            <main className="flex flex-wrap container mx-auto">
                <div className="w-full text-white">
                    <Link href={'/artists'} className="w-full">
                        <div className="bg-gradient-to-r from-primary to-azure rounded-3xl grid grid-cols-2">
                            <div className="inline-block py-10 px-20">
                                <h1>Artists Wanted!</h1>
                                <p>Something Clever Here</p>

                                <button className="mt-20 btn btn-outline btn-accent inline-block">
                                    Click Here to become an artist!
                                </button>
                            </div>
                            <div className="flex justify-end items-end">
                                <Image
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
                <RandomArtists />
            </main>
        </DefaultPageLayout>
    )
}
