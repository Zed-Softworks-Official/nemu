import { redirect } from 'next/navigation'

import NemuImage from '~/components/nemu-image'
import Container from '~/components/ui/container'
import DashboardContainer from '~/components/ui/dashboard-container'

import { api } from '~/trpc/server'
import { getServerAuthSession } from '~/server/auth'
import Link from 'next/link'

export default async function PortfolioDashboardPage() {
    const session = await getServerAuthSession()

    if (!session || !session.user.artist_id) {
        return redirect('/u/login')
    }

    const portfolio_items = await api.portfolio.get_portfolio_list({
        artist_id: session?.user.artist_id
    })

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
