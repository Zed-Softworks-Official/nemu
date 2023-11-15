'use client'

import useSWR from 'swr'
import Image from 'next/image'
import Markdown from 'react-markdown'

import { FormEvent, useState } from 'react'

import { useParams } from 'next/navigation'
import { fetcher } from '@/helpers/fetcher'
import { ShoppingCartIcon } from '@heroicons/react/20/solid'

import Loading from '@/app/[handle]/loading'

export default function ShopItem() {
    const routeParams = useParams()
    const { data, isLoading } = useSWR(
        `/api/stripe/${routeParams['id']}/product`,
        fetcher
    )

    const [currentImage, setCurrentImage] = useState('')

    if (isLoading) {
        return <Loading />
    }

    return (
        <div className="grid grid-cols-12 gap-5 bg-white dark:bg-fullblack rounded-3xl p-5 container mx-auto">
            <div className="col-span-4">
                <Image
                    src={currentImage}
                    width={500}
                    height={500}
                    alt={data?.product.name}
                    className="rounded-xl"
                />
            </div>
            <div className="col-span-1">
                <div className="grid-flow-row grid grid-cols-1 gap-5">
                    <Image
                        src={data?.product.featured_image}
                        width={100}
                        height={100}
                        alt={data?.product.name}
                        className="rounded-xl cursor-pointer"
                        onClick={() => setCurrentImage(data?.product.featured_image)}
                    />
                    {data?.product.images?.map((image: string) => (
                        <Image
                            src={image}
                            width={100}
                            height={100}
                            alt={data?.product.name}
                            className="rounded-xl cursor-pointer"
                            onClick={() => setCurrentImage(image)}
                        />
                    ))}
                </div>
            </div>
            <div className="col-span-7">
                <div>
                    <h1>{data?.product.name}</h1>
                    <Markdown>{data?.product.description}</Markdown>
                </div>
                <form className="relative bottom-0 my-10" action="/api/stripe/purchase" method="post">
                    <input name="product_id" type="hidden" value={routeParams['id']} />
                    <input name="stripe_account" type="hidden" value={'acct_1NpORkPjdXx3ktPl'} />
                    <button className="bg-primary hover:bg-azure rounded-xl p-5 w-full" type="submit">
                        <ShoppingCartIcon className="w-6 h-6 inline-block mr-5" />
                        Buy Now
                    </button>
                </form>
            </div>
        </div>
    )
}
