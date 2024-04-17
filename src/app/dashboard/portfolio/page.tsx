import { redirect } from 'next/navigation'
import NemuImage from '~/components/nemu-image'
import Container from '~/components/ui/container'
import DashboardContainer from '~/components/ui/dashboard-container'
import { getServerAuthSession } from '~/server/auth'
import { api } from '~/trpc/server'

export default async function CreatePortfolioPage() {
    const session = await getServerAuthSession()

    if (!session || !session.user.artist_id) {
        return redirect('/u/login')
    }

    const portfolio_items = await api.portfolio.get_portfolio_items({
        artist_id: session?.user.artist_id
    })

    return (
        <DashboardContainer title="Portfolio" addButtonUrl="/dashboard/portfolio/create">
            <div className="grid grid-cols-3 gap-5">
                {portfolio_items.map((item) => (
                    <Container
                    className='h-fit'
                    variant={'muted'}
                        figure={
                            <NemuImage
                                src={item.image.url}
                                alt="image"
                                width={200}
                                height={200}
                                className='w-full h-full'
                            />
                        }
                    >
                        <h2 className="card-title">{item.name}</h2>
                    </Container>
                ))}
            </div>
        </DashboardContainer>
    )
}
