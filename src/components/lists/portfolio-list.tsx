import { api } from '~/trpc/server'
import NemuImage from '~/components/nemu-image'

export default async function PortfolioList({ artist_id }: { artist_id: string }) {
    const portfolio = await api.portfolio.get_portfolio_list({ artist_id })

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 w-full">
            {portfolio.map((portfolioItem) => {
                return (
                    <div
                        key={portfolioItem.id}
                        className="card bg-base-100 shadow-xl transition-all duration-200 ease-in-out animate-pop-in"
                    >
                        <figure>
                            <NemuImage
                                src={portfolioItem.image!.url}
                                placeholder="blur"
                                blurDataURL={portfolioItem.image.blur_data}
                                alt="Featured Image"
                                width={400}
                                height={400}
                                className="w-full h-full"
                            />
                        </figure>
                        <div className="card-body h-full">
                            <h2 className="text-3xl font-bold flex items-center gap-2">
                                {portfolioItem.name}
                            </h2>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
