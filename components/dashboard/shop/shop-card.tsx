import Link from 'next/link'
import Image from 'next/image'

import { ShopItem } from '@/helpers/api/request-inerfaces'

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
        : `/@${handle}/shop/${product.prod_id}`

    return (
        <Link
            href={href}
            key={product.name}
            className="bg-charcoal rounded-xl overflow-hidden"
        >
            <div>
                <Image
                    width={500}
                    height={500}
                    src={product.featured_image}
                    alt={product.name}
                    draggable={false}
                />
            </div>
            <div className="p-5">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <p className="font-bold text-2xl pb-2">{product.name}</p>
                        <p className="text-lg">${product.price}</p>
                    </div>
                    <div className="flex flex-col justify-center">
                        {dashboard ? (
                            <Link
                                href={href}
                                className="p-5 w-full text-center bg-primary rounded-xl font-bold hover:bg-primarylight"
                            >
                                Edit Item
                            </Link>
                        ) : (
                            <Link
                                href={href}
                                className="p-5 w-full text-center bg-gradient-to-r from-azure to-primarylight rounded-xl font-bold hover:from-primarylight hover:to-azure"
                            >
                                View
                            </Link>
                        )}
                    </div>
                </div>
            </div>
        </Link>
    )
}
