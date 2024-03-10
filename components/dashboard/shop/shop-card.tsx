import Link from 'next/link'

import { ShopItem } from '@/core/structures'
import ShopDisplay from '@/components/artist-page/shop-item'
import NemuImage from '@/components/nemu-image'
import { useState } from 'react'
import Modal from '@/components/modal'

export default function ShopCard({ product, handle, dashboard = false }: { product: ShopItem; handle?: string; dashboard?: boolean }) {
    const href = dashboard ? `/dashboard/shop/item/${product.prod_id}` : `/@${handle}/shop/${product.slug}`

    const [showModal, setShowModal] = useState(false)

    return (
        <div key={product.name} className="bg-base-100 card rounded-xl overflow-hidden h-fit shadow-xl transition-all duration-200 animate-pop-in">
            <div>
                <NemuImage width={500} height={500} src={product.featured_image} alt={product.name} />
            </div>
            <div className="p-5">
                <div className="card-body">
                    <div>
                        <p className="card-title">{product.name}</p>
                        <p className="text-lg font-bold">${product.price}</p>
                    </div>
                    <div className="card-actions justify-end">
                        {dashboard ? (
                            <Link href={href} className="btn btn-primary">
                                Edit Item
                            </Link>
                        ) : (
                            <>
                                <button type="button" className="btn btn-primary" onClick={() => setShowModal(true)}>
                                    View Item
                                </button>
                                <Modal showModal={showModal} setShowModal={setShowModal} background="bg-base-300">
                                    <ShopDisplay handle={handle!} product={product} />
                                </Modal>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
