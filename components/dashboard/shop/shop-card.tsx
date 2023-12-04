'use client'

import Link from 'next/link'
import Image from 'next/image'

import { ShopItem } from '@/helpers/api/request-inerfaces'
import { useShopContext } from '@/components/artist-page/shop-context'
import Button from '@/components/button'

export default function ShopCard({
    product,
    dashboard = false
}: {
    product: ShopItem
    dashboard?: boolean
}) {
    const { handle, setProductId } = useShopContext()

    const href = dashboard
        ? `/dashboard/shop/item/${product.prod_id}`
        : `/@${handle}/shop/item`

    return (
        <Link
            href={href}
            key={product.name}
            className="dark:bg-charcoal bg-fullwhite rounded-xl overflow-hidden"
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
                    <div className="flex flex-col justify-center text-white">
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
                                onClick={() => setProductId!(product.prod_id!)}
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
