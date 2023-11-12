import Link from 'next/link'
import Image from 'next/image'

import { ShopItem } from '@/helpers/api/request-inerfaces'

export default function ShopCard({
    product,
    dashboard = false
}: {
    product: ShopItem
    dashboard?: boolean
}) {
    return (
        <Link
            href={'/'}
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
            <div className="grid grid-cols-2 gap-2 px-5 pb-5">
                <div>
                    <h1>{product.name}</h1>
                    <h2>${product.price}</h2>
                </div>
                <div className="flex flex-row items-center justify-center">
                    {dashboard ? (
                        <Link
                            href={`/dashboard/product/${product.prod_id}`}
                            className="p-5 bg-primary rounded-xl font-bold hover:bg-primarylight"
                        >
                            Edit Item
                        </Link>
                    ) : (
                        <h1>Dashboard False</h1>
                    )}
                </div>
            </div>
        </Link>
    )
}
