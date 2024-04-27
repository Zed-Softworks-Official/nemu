import { api } from '~/trpc/server'

import NemuImage from '~/components/nemu-image'
import Masonry from '~/components/ui/masonry'

export default async function PortfolioList({ artist_id }: { artist_id: string }) {
    const portfolio = await api.portfolio.get_portfolio_list({ artist_id })

    return (
        <Masonry columns={'4'}>
            {portfolio.map((item) => (
                <NemuImage
                    key={item.id}
                    src={item.image.url}
                    placeholder="blur"
                    blurDataURL={item.image.blur_data}
                    alt={item.name}
                    className="rounded-xl transition-all duration-200 ease-in-out animate-pop-in"
                    width={400}
                    height={400}
                />
            ))}
        </Masonry>
    )
}
