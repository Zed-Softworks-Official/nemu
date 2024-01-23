'use client'

import useSWR from 'swr'
import Markdown from 'react-markdown'

import { useState } from 'react'

import { fetcher } from '@/core/helpers'
import { ShoppingCartIcon } from '@heroicons/react/20/solid'

import Loading from '@/components/loading'
import { redirect } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Button from '../button'
import { ShopResponse, StatusCode } from '@/core/responses'
import NemuImage from '../nemu-image'

export default function ShopDisplay({ handle, slug }: { handle: string; slug: string }) {
    const { data: session } = useSession()
    const { data, isLoading } = useSWR<ShopResponse>(
        `/api/stripe/${handle}/product/${slug}`,
        fetcher
    )

    const [currentImage, setCurrentImage] = useState('')

    if (isLoading) {
        return <Loading />
    }

    if (data?.status != StatusCode.Success) {
        redirect('/')
    }

    return (
        <div className="grid grid-cols-12 gap-5 bg-white dark:bg-fullblack rounded-3xl p-5">
            <div className="col-span-4">
                <NemuImage
                    src={
                        currentImage == '' ? data?.product?.featured_image! : currentImage
                    }
                    width={500}
                    height={500}
                    alt={data?.product?.name!}
                    className="rounded-xl"
                />
            </div>
            <div className="col-span-1">
                <div className="grid-flow-row grid grid-cols-1 gap-5">
                    <NemuImage
                        src={data?.product?.featured_image!}
                        width={100}
                        height={100}
                        alt={data?.product?.name!}
                        className="rounded-xl cursor-pointer"
                        onClick={() => setCurrentImage(data?.product?.featured_image!)}
                    />
                    {data?.product?.images?.map((image: string) => (
                        <NemuImage
                            key={data?.product?.name}
                            src={image}
                            width={100}
                            height={100}
                            alt={data?.product?.name!}
                            className="rounded-xl cursor-pointer"
                            onClick={() => setCurrentImage(image)}
                        />
                    ))}
                </div>
            </div>
            <div className="col-span-7">
                <div>
                    <h1>{data?.product?.name}</h1>
                    <Markdown>{data?.product?.description}</Markdown>
                </div>
                <form
                    className="relative bottom-0 my-10"
                    action="/api/stripe/purchase"
                    method="post"
                >
                    <input
                        name="product_id"
                        type="hidden"
                        value={data.product?.prod_id}
                    />
                    <input name="stripe_account" type="hidden" value={data.stripe_id} />
                    <input name="user_id" type="hidden" value={session?.user.user_id} />
                    <Button
                        label="Buy Now"
                        icon={<ShoppingCartIcon className="w-6 h-6 inline-block mr-5" />}
                        type="submit"
                    />
                </form>
            </div>
        </div>
    )
}
