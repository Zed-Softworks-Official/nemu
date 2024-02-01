import NemuImage from '../nemu-image'
import { PortfolioItem } from '@/core/structures'

export default function Portfolio({
    portfolio_items
}: {
    portfolio_items: PortfolioItem[]
}) {
    return (
        <div className="flex flex-wrap gap-5 flex-1 flex-grow">
            {portfolio_items.map((item) => {
                return (
                    <div
                        key={item.name}
                        className="bg-base-100 w-fit h-fit rounded-xl animate-pop-in transition-all duration-200"
                    >
                        <NemuImage
                            src={item.signed_url}
                            alt={item.name}
                            width={300}
                            height={300}
                            className="rounded-xl w-full h-fit max-w-xs"
                        />
                    </div>
                )
            })}
        </div>
    )
}
