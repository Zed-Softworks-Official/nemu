import { redirect } from 'next/navigation'
import PortfolioCreateEditForm from '~/components/dashboard/forms/portfolio-create-edit'
import UploadThingProvider from '~/components/files/uploadthing-context'
import DashboardContainer from '~/components/ui/dashboard-container'
import { getServerAuthSession } from '~/server/auth'
import { api } from '~/trpc/server'

export default async function PortfolioItemEditPage({
    params
}: {
    params: { id: string }
}) {
    const session = await getServerAuthSession()

    if (!session || !session.user.artist_id) {
        return redirect('/u/login')
    }

    const portfolio_item = await api.portfolio.get_portfolio({
        artist_id: session.user.artist_id,
        item_id: params.id
    })

    return (
        <DashboardContainer title="Edit Portfolio Item">
            <UploadThingProvider endpoint="portfolioUploader">
                <PortfolioCreateEditForm data={portfolio_item} />
            </UploadThingProvider>
        </DashboardContainer>
    )
}
