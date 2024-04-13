'use client'

import Link from 'next/link'

import Masonary, { ResponsiveMasonry } from 'react-responsive-masonry'
import { RouterOutput } from '@/core/responses'
import NemuImage from '@/components/nemu-image'
import Card from '@/components/ui/card'

export default function PortfolioItems({
    data
}: {
    data: RouterOutput['portfolio']['get_portfolio_items']
}) {
    return (
        <ResponsiveMasonry columnsCountBreakPoints={{ 350: 1, 900: 2, 1024: 3, 1280: 4 }}>
            <Masonary gutter="3rem">
                {data.map((item) => (
                    <Link
                        key={item.data.image_key}
                        href={`/dashboard/portfolio/item/${item.data.image_key}`}
                        className="transition-all duration-150 animate-pop-in"
                    >
                        <Card
                            figure={
                                <NemuImage
                                    src={item.data.signed_url}
                                    placeholder="blur"
                                    blurDataURL={item.data.blur_data}
                                    alt={item.name}
                                    width={200}
                                    height={200}
                                />
                            }
                            body={<h2 className="card-title">{item.name}</h2>}
                        />
                    </Link>
                ))}
                {/* {data.map((item: PortfolioItem) => {
                    return (
                        <Link
                            href={`/dashboard/portfolio/item/${item.image_key}`}
                            key={item.name}
                            className="card bg-base-100 shadow-xl rounded-3xl transition-all duration-200 animate-pop-in"
                        >
                            <div>
                                <NemuImage
                                    src={item.signed_url}
                                    alt={item.name}
                                    width={400}
                                    height={400}
                                    className="rounded-3xl rounded-b-none w-full"
                                />
                                <div className="card-body">
                                    <h2 className="text-center font-bold text-2xl">
                                        {item.name}
                                    </h2>
                                </div>
                            </div>
                        </Link>
                    )
                })} */}
            </Masonary>
        </ResponsiveMasonry>
    )
}
