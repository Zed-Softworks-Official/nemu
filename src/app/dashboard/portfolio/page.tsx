import { redirect } from 'next/navigation'

import NemuImage from '~/components/nemu-image'
import DashboardContainer from '~/components/ui/dashboard-container'

import { api } from '~/trpc/server'
import { getServerAuthSession } from '~/server/auth'
import Link from 'next/link'
import EmptyState from '~/components/ui/empty-state'
import { ImagePlusIcon } from 'lucide-react'
import Masonry from '~/components/ui/masonry'

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
                    icon={<ImagePlusIcon className="h-10 w-10" />}
                    heading="No Portfolio Items"
                    description="Get started by creating a protfolio item"
                    button_text="Create Portfolio Item"
                />
            </DashboardContainer>
        )
    }

    return (
        <DashboardContainer title="Portfolio" addButtonUrl="/dashboard/portfolio/create">
            <Masonry columns={'4'}>
                {portfolio_items.map((item) => (
                    <div
                        key={item.id}
                        className="animate-pop-in transition-all duration-200 ease-in-out active:scale-95"
                    >
                        <Link href={`/dashboard/portfolio/${item.id}`}>
                            <NemuImage
                                src={item.image.url}
                                alt="image"
                                width={500}
                                height={500}
                                className="h-full w-full rounded-xl"
                            />
                        </Link>
                    </div>
                ))}
            </Masonry>
        </DashboardContainer>
    )
}
