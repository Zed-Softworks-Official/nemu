import Link from 'next/link'

import NemuImage from '~/components/nemu-image'
import { Separator } from '~/components/ui/separator'

const products = [
    {
        id: 1,
        name: 'Product 1',
        price: 100
    },
    {
        id: 2,
        name: 'Product 2',
        price: 200
    },
    {
        id: 3,
        name: 'Product 3',
        price: 300
    },
    {
        id: 4,
        name: 'Product 4',
        price: 400
    },
    {
        id: 5,
        name: 'Product 5',
        price: 500
    },
    {
        id: 6,
        name: 'Product 6',
        price: 600
    },
    {
        id: 7,
        name: 'Product 7',
        price: 700
    },
    {
        id: 8,
        name: 'Product 8',
        price: 800
    },
    {
        id: 9,
        name: 'Product 9',
        price: 900
    },
    {
        id: 10,
        name: 'Product 10',
        price: 1000
    },
    {
        id: 11,
        name: 'Product 11',
        price: 1100
    },
    {
        id: 12,
        name: 'Product 12',
        price: 1200
    },
    {
        id: 13,
        name: 'Product 13',
        price: 1300
    },
    {
        id: 14,
        name: 'Product 14',
        price: 1400
    },
    {
        id: 15,
        name: 'Product 15',
        price: 1500
    },
    {
        id: 16,
        name: 'Product 16',
        price: 1600
    },
    {
        id: 17,
        name: 'Product 17',
        price: 1700
    },
    {
        id: 18,
        name: 'Product 18',
        price: 1800
    },
    {
        id: 19,
        name: 'Product 19',
        price: 1900
    },
    {
        id: 20,
        name: 'Product 20',
        price: 2000
    }
]

export default function ArtistCornerPage() {
    return (
        <div className="container mx-auto mb-4">
            <div className="mx-auto grid max-w-[--breakpoint-2xl] gap-4 pt-5 md:grid-cols-6 md:grid-rows-2 lg:max-h-[calc(100vh-200px)]">
                <div className="md:col-span-4 md:row-span-2">
                    <Product href="/artist-corner" />
                </div>
                <div className="md:col-span-2 md:row-span-1">
                    <Product href="/artist-corner" />
                </div>
                <div className="md:col-span-2 md:row-span-1">
                    <Product href="/artist-corner" />
                </div>
            </div>

            <Separator className="my-4" />
            <ProductList />
        </div>
    )
}

function ProductList() {
    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {products.map((product) => (
                <Product key={product.id} href="/artist-corner" />
            ))}
        </div>
    )
}

function Product(props: { href: string }) {
    return (
        <Link href={props.href} className="relative block aspect-square h-full w-full">
            <div className="group bg-secondary hover:border-primary relative flex h-full w-full items-center justify-center overflow-hidden rounded-lg border">
                <NemuImage src="/profile.png" alt="/" width={300} height={300} />
                <div className="@container/label absolute bottom-0 left-0 flex h-fit w-full px-4 pb-4 lg:px-10 lg:pb-[10%]">
                    <div className="bg-background/80 text-foreground flex items-center rounded-full border p-1 text-xs font-semibold backdrop-blur-md">
                        <div className="flex flex-col gap-2">
                            <h3 className="mr-4 line-clamp-2 grow pl-2 leading-none tracking-tight">
                                Item
                            </h3>
                        </div>
                        <p className="bg-primary text-foreground flex-none rounded-full p-2">
                            $20.00
                        </p>
                    </div>
                </div>
            </div>
        </Link>
    )
}
