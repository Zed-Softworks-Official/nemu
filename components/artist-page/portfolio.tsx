import NemuImage from '../nemu-image'
import Masonary, { ResponsiveMasonry } from 'react-responsive-masonry'
import Loading from '../loading'
import { api } from '@/core/trpc/react'

export default function Portfolio({ artist_id }: { artist_id: string }) {
    const { data, isLoading } = api.portfolio.get_portfolio_items.useQuery({ artist_id })

    if (isLoading) {
        return <Loading />
    }

    return (
        <ResponsiveMasonry columnsCountBreakPoints={{ 350: 1, 1024: 2, 1280: 3 }}>
            <Masonary gutter='3rem'>
                {data?.map((item, i) => {
                    return (
                        <div
                            key={item.name}
                            className="flex justify-center items-center rounded-xl animate-pop-in transition-all duration-200 p-2"
                        >
                            <NemuImage
                                src={item.signed_url}
                                alt={item.name}
                                width={300}
                                height={300}
                                className="rounded-xl max-w-sm object-cover"
                            />
                        </div>
                    )
                })}
            </Masonary>
        </ResponsiveMasonry>
    )
}
