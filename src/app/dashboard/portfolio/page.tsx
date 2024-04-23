import { redirect } from 'next/navigation'

import NemuImage from '~/components/nemu-image'
import DashboardContainer from '~/components/ui/dashboard-container'

import { api } from '~/trpc/server'
import { getServerAuthSession } from '~/server/auth'
import Link from 'next/link'
import EmptyState from '~/components/ui/empty-state'
import { ImagePlusIcon } from 'lucide-react'

export default async function PortfolioDashboardPage() {
    const session = await getServerAuthSession()

    if (!session || !session.user.artist_id) {
        return redirect('/u/login')
    }

    const portfolio_items = await api.portfolio.get_portfolio_list({
        artist_id: session?.user.artist_id
    })

    if (portfolio_items.length === 0) {
        return (
            <DashboardContainer title="Portfolio" contentClassName="h-full">
                <EmptyState
                    create_url="/dashboard/portfolio/create"
                    icon={<ImagePlusIcon className="w-10 h-10" />}
                    heading="No Portfolio Items"
                    description="Get started by creating a protfolio item"
                    button_text="Create Portfolio Item"
                />
            </DashboardContainer>
        )
    }

    return (
        <DashboardContainer title="Portfolio" addButtonUrl="/dashboard/portfolio/create">
            <div className="columns-1 gap-5 lg:gap-8 sm:columns-2 lg:columns-3 xl:columns-4 [&>div:not(:first-child)]:mt-5 lg:[&>div:not(:first-child)]:mt-8">
                {portfolio_items.map((item) => (
                    <div key={item.id}>
                        <Link
                            href={`/dashboard/portfolio/${item.id}`}
                            className="transition-all duration-200 ease-in-out active:scale-95 animate-pop-in"
                        >
                            <div className="card bg-base-200 shadow-xl">
                                <figure>
                                    <NemuImage
                                        src={item.image.url}
                                        alt="image"
                                        width={500}
                                        height={500}
                                        className="w-full h-full"
                                    />
                                </figure>
                                <div className="card-body">
                                    <h2 className="card-title">{item.name}</h2>
                                </div>
                            </div>
                        </Link>
                    </div>
                ))}
            </div>
        </DashboardContainer>
    )
}
