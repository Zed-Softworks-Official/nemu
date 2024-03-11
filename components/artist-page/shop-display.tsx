'use client'

import Markdown from 'react-markdown'

import { useState } from 'react'

import { ShareIcon, ShoppingCartIcon } from '@heroicons/react/20/solid'

import Loading from '@/components/loading'
import { useSession } from 'next-auth/react'
import NemuImage from '../nemu-image'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { toast } from 'react-toastify'

import 'react-toastify/ReactToastify.min.css'
import { CheckoutType, ShopItem } from '@/core/structures'
import { Transition } from '@headlessui/react'
import useSWR from 'swr'
import { FormatNumberToCurrency, GraphQLFetcher } from '@/core/helpers'

const PaymentForm = dynamic(() => import('../payments/payment-form'))

export default function ShopDisplay({ handle, product, artist_id }: { handle: string; product: ShopItem; artist_id: string }) {
    const { data: session } = useSession()
    const { data, isLoading } = useSWR(
        `{
            user(id: "${session?.user.user_id}") {
                find_customer_id(artist_id: "${artist_id}") {
                    customerId
                }
            }
        }`,
        GraphQLFetcher<{
            user: {
                find_customer_id: {
                    customerId: string
                }
            }
        }>
    )

    const [currentImage, setCurrentImage] = useState('')
    const [buyFormVisible, setBuyFormVisible] = useState(false)

    if (isLoading) {
        return <Loading />
    }

    return (
        <div className="flex gap-5 bg-base-300 rounded-xl p-5">
            <div>
                <NemuImage
                    src={currentImage == '' ? product.featured_image! : currentImage}
                    width={1000}
                    height={1000}
                    alt={product?.title!}
                    className="rounded-xl"
                />
                <div className="flex flex-wrap gap-3 my-5 justify-evenly">
                    <div className="overflow-hidden rounded-xl cursor-pointer aspect-square transition-all duration-150 scale-100 hover:scale-110">
                        <NemuImage
                            src={product?.featured_image!}
                            width={100}
                            height={100}
                            alt={product?.title!}
                            onClick={() => setCurrentImage(product.featured_image!)}
                        />
                    </div>
                    {product?.images?.map((image: string) => (
                        <div className="overflow-hidden rounded-xl cursor-pointer aspect-square transition-all duration-150 scale-100 hover:scale-110">
                            <NemuImage
                                key={product.title}
                                src={image}
                                width={100}
                                height={100}
                                alt={product.title!}
                                onClick={() => setCurrentImage(image)}
                            />
                        </div>
                    ))}
                </div>
            </div>
            <div className="card bg-base-100 w-full shadow-xl max-h-fit">
                <div className="card-body">
                    <div>
                        <div className="flex justify-between items-center">
                            <div>
                                <h1 className="font-bold text-3xl">{product?.title}</h1>
                                <p className="text-xl text-base-content/80">
                                    By{' '}
                                    <Link href={`/@${handle}`} target="_blank" className="text-base-content hover:underline hover:underline-offset-4">
                                        {handle}
                                    </Link>
                                </p>
                            </div>
                            <div>
                                <button
                                    type="button"
                                    className="btn btn-outline btn-accent"
                                    onClick={async () => {
                                        await navigator.clipboard.writeText(`http://localhost:3000/@${handle}/shop/${product.slug}`)
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
                        <h2 className='card-title'>{FormatNumberToCurrency(product.price)}</h2>
                        <button type="button" className="btn btn-primary" onClick={() => setBuyFormVisible(true)}>
                            <ShoppingCartIcon className="w-6 h-6" />
                            Buy Now
                        </button>
                    </Transition>
                    {buyFormVisible && (
                        <PaymentForm
                            submitted={buyFormVisible}
                            form_type="product"
                            checkout_data={{
                                checkout_type: CheckoutType.Product,
                                customer_id: data?.user.find_customer_id.customerId!,
                                price: product.price,
                                stripe_account: product.stripe_account!,
                                return_url: `http://localhost:3000/$${handle}`,
                                user_id: session?.user.user_id!,
                                product_id: product.id!,
                                artist_id: artist_id
                            }}
                        />
                    )}
                </div>
            </div>
        </div>
    )
}
