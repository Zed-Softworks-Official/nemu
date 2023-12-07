import Link from 'next/link'

import { ShopItem } from '@/helpers/api/request-inerfaces'
import ShopDisplay from '@/components/artist-page/shop-item'
import NemuImage from '@/components/nemu-image'

export default function ShopCard({
    product,
    handle,
    dashboard = false
}: {
    product: ShopItem
    handle?: string
    dashboard?: boolean
}) {
    const href = dashboard
        ? `/dashboard/shop/item/${product.prod_id}`
        : `/@${handle}/shop/${product.slug}`

    return (
        <div key={product.name} className="bg-base-100 card rounded-xl overflow-hidden">
            <div>
                <NemuImage
                    width={500}
                    height={500}
                    src={product.featured_image}
                    alt={product.name}
                />
            </div>
            <div className="p-5">
                <div className="card-body">
                    <div>
                        <p className="card-title">{product.name}</p>
                        <p className="text-lg font-bold">${product.price}</p>
                    </div>
                    <div className="card-actions justify-end">
                        {dashboard ? (
                            <Link
                                href={href}
                                className="btn btn-primary"
                            >
                                Edit Item
                            </Link>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={() =>
                                        (
                                            document.getElementById(
                                                `modal-${product.slug}`
                                            ) as HTMLDialogElement
                                        ).showModal()
                                    }
                                >
                                    View Item
                                </button>
                                <dialog id={`modal-${product.slug}`} className="modal">
                                    <div className="modal-box max-w-6xl">
                                        <ShopDisplay
                                            handle={handle!}
                                            slug={product.slug!}
                                        />
                                    </div>
                                    <form method="dialog" className="modal-backdrop">
                                        <button>close</button>
                                    </form>
                                </dialog>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
