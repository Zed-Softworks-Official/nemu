import { redirect } from 'next/navigation'

import NemuImage from '~/components/nemu-image'
import Container from '~/components/ui/container'
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
            <DashboardContainer title="Portfolio">
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
            <div className="grid grid-cols-3 gap-5">
                {portfolio_items.map((item) => (
                    <Link
                        href={`/dashboard/portfolio/${item.id}`}
                        key={item.id}
                        className="transition-all duration-200 ease-in-out active:scale-95 animate-pop-in"
                    >
                        <Container
                            className="h-fit"
                            variant={'muted'}
                            figure={
                                <NemuImage
                                    src={item.image.url}
                                    alt="image"
                                    width={500}
                                    height={500}
                                    className="w-full h-full"
                                />
                            }
                        >
                            <h2 className="card-title">{item.name}</h2>
                        </Container>
                    </Link>
                ))}
            </div>
        </DashboardContainer>
    )
}
