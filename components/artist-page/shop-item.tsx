'use client'

import useSWR from 'swr'
import Markdown from 'react-markdown'

import { useState } from 'react'

import { fetcher } from '@/core/helpers'
import { ShareIcon, ShoppingCartIcon } from '@heroicons/react/20/solid'

import Loading from '@/components/loading'
import { redirect, usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { ShopResponse, StatusCode } from '@/core/responses'
import NemuImage from '../nemu-image'
import Link from 'next/link'
import { toast } from 'react-toastify'

import 'react-toastify/ReactToastify.min.css'

export default function ShopDisplay({ handle, slug }: { handle: string; slug: string }) {
    const { data: session } = useSession()
    const { data, isLoading } = useSWR<ShopResponse>(
        `/api/stripe/${handle}/product/${slug}`,
        fetcher
    )
    const currentPath = usePathname()

    const [currentImage, setCurrentImage] = useState('')

    if (isLoading) {
        return <Loading />
    }

    if (data?.status != StatusCode.Success) {
        redirect('/')
    }

    return (
        <div className="flex gap-5 bg-base-300 rounded-xl p-5">
            <div>
                <NemuImage
                    src={
                        currentImage == '' ? data?.product?.featured_image! : currentImage
                    }
                    width={1000}
                    height={1000}
                    alt={data?.product?.name!}
                    className="rounded-xl"
                />
                <div className="flex flex-wrap gap-3 my-5 justify-evenly">
                    <div className="overflow-hidden rounded-xl cursor-pointer aspect-square">
                        <NemuImage
                            src={data?.product?.featured_image!}
                            width={100}
                            height={100}
                            alt={data?.product?.name!}
                            onClick={() =>
                                setCurrentImage(data?.product?.featured_image!)
                            }
                        />
                    </div>
                    {data?.product?.images?.map((image: string) => (
                        <div className="overflow-hidden rounded-xl cursor-pointer aspect-square">
                            <NemuImage
                                key={data?.product?.name}
                                src={image}
                                width={100}
                                height={100}
                                alt={data?.product?.name!}
                                onClick={() => setCurrentImage(image)}
                            />
                        </div>
                    ))}
                </div>
            </div>
            <div className="col-auto card bg-base-100 w-full shadow-xl max-h-fit">
                <div className="card-body">
                    <div>
                        <div className="flex justify-between items-center">
                            <div>
                                <h1 className="font-bold text-3xl">
                                    {data?.product?.name}
                                </h1>
                                <p className="text-xl text-base-content/80">
                                    By{' '}
                                    <Link
                                        href={'/'}
                                        target="_blank"
                                        className="text-base-content hover:underline hover:underline-offset-4"
                                    >
                                        {data.product?.prod_id}
                                    </Link>
                                </p>
                            </div>
                            <div>
                                <button
                                    type="button"
                                    className="btn btn-outline btn-accent"
                                    onClick={async () => {
                                        await navigator.clipboard.writeText(
                                            `http://localhost:3000/${currentPath}`
                                        )
                                        toast('Copied to clipboard', {
                                            type: 'success',
                                            theme: 'dark'
                                        })
                                    }}
                                >
                                    <ShareIcon className="w-6 h-6" />
                                    Share
                                </button>
                            </div>
                        </div>
                        <div className="divider"></div>
                        <Markdown>{data?.product?.description}</Markdown>
                        <div className="divider"></div>
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
                        <input
                            name="stripe_account"
                            type="hidden"
                            value={data.stripe_id}
                        />
                        <input
                            name="user_id"
                            type="hidden"
                            value={session?.user.user_id}
                        />
                        <div className="card-actions justify-between items-center">
                            <h2 className="font-bold text-2xl">${data.product?.price}</h2>
                            <button type="submit" className="btn btn-primary">
                                <ShoppingCartIcon className="w-6 h-6" />
                                Buy Now
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}
