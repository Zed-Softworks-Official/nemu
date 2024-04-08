'use client'

import Link from 'next/link'

import { ShopItem } from '@/core/structures'
import NemuImage from '@/components/nemu-image'
import { useState } from 'react'
import Modal from '@/components/modal'
import { FormatNumberToCurrency } from '@/core/helpers'
import dynamic from 'next/dynamic'

const ShopDisplay = dynamic(() => import('@/components/artist-page/shop-display'))

export default function ShopCard({
    product,
    handle,
    artist_id
}: {
    product: ShopItem
    artist_id: string
    handle: string
}) {
    const [showModal, setShowModal] = useState(false)

    return (
        <div
            key={product.id}
            className="card bg-base-200 shadow-xl animate-pop-in transitiona-ll duration-150"
        >
            <figure>
                <NemuImage
                    src={product.featured_image.signed_url}
                    blurDataURL={product.featured_image.blur_data}
                    placeholder="blur"
                    alt={product.title}
                    width={300}
                    height={300}
                    className="w-full h-full"
                />
            </figure>
            <div className="card-body">
                <h2 className="card-title">{product.title}</h2>
                <span className="text-lg font-bold">
                    {FormatNumberToCurrency(product.price)}
                </span>
                <div className="card-actions justify-end mt-5">
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => setShowModal(true)}
                    >
                        View Product
                    </button>
                </div>
            </div>
            <Modal
                showModal={showModal}
                setShowModal={setShowModal}
                classNames="bg-base-300"
            >
                <ShopDisplay handle={handle} product={product} artist_id={artist_id} />
            </Modal>
        </div>
    )
}
