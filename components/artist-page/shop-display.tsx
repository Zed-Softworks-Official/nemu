'use client'

import Markdown from 'react-markdown'

import { useState } from 'react'

import { ShareIcon, ShoppingCartIcon } from '@heroicons/react/20/solid'

import Loading from '@/components/loading'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { toast } from 'react-toastify'

import 'react-toastify/ReactToastify.min.css'
import { ImageData, ShopItem } from '@/core/structures'
import { Transition } from '@headlessui/react'
import { FormatNumberToCurrency } from '@/core/helpers'
import ImageViewer from './image-veiwer'
import { api } from '@/core/trpc/react'

const PaymentForm = dynamic(() => import('../payments/payment-form'))

export default function ShopDisplay({
    handle,
    product,
    artist_id
}: {
    handle: string
    product: ShopItem
    artist_id: string
}) {
    const { data, isLoading } = api.user.get_customer_id.useQuery(artist_id)

    const [buyFormVisible, setBuyFormVisible] = useState(false)

    if (isLoading) {
        return <Loading />
    }

    return (
        <div className="flex gap-5 bg-base-300 rounded-xl p-5">
            <ImageViewer
                featured_image={product.featured_image}
                additional_images={product.images}
            />
            <div className="card bg-base-100 w-full shadow-xl max-h-fit">
                <div className="card-body">
                    <div>
                        <div className="flex justify-between items-center">
                            <div>
                                <h1 className="font-bold text-3xl">{product?.title}</h1>
                                <p className="text-xl text-base-content/80">
                                    By{' '}
                                    <Link
                                        href={`/@${handle}`}
                                        target="_blank"
                                        className="text-base-content hover:underline hover:underline-offset-4"
                                    >
                                        {handle}
                                    </Link>
                                </p>
                            </div>
                            <div>
                                <button
                                    type="button"
                                    className="btn btn-outline btn-accent"
                                    onClick={async () => {
                                        await navigator.clipboard.writeText(
                                            `http://localhost:3000/@${handle}/shop/${product.slug}`
                                        )
                                        toast('Copied to clipboard', {
                                            type: 'info',
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
                        <Markdown>{product?.description}</Markdown>
                        <div className="divider"></div>
                    </div>
                    <Transition
                        as="div"
                        className={'card-actions justify-between items-center'}
                        show={!buyFormVisible}
                        leave="transition-all duration-200 ease-in-out"
                        leaveFrom="opacity-100"
                        leaveTo="opacity-0"
                    >
                        <h2 className="card-title">
                            {FormatNumberToCurrency(product.price)}
                        </h2>
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => setBuyFormVisible(true)}
                        >
                            <ShoppingCartIcon className="w-6 h-6" />
                            Buy Now
                        </button>
                    </Transition>
                    {buyFormVisible && (
                        <PaymentForm
                            submitted={buyFormVisible}
                            checkout_data={{
                                customer_id: data?.customerId,
                                stripe_account: product.stripe_account!,
                                return_url: `http://localhost:3000/@${handle}`,
                                product_id: product.id!
                            }}
                        />
                    )}
                </div>
            </div>
        </div>
    )
}
