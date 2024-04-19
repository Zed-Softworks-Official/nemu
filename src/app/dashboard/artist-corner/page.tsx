import DashboardContainer from '~/components/ui/dashboard-container'

export default async function ArtistCornerDashboardPage() {
    return (
        <DashboardContainer title="Artist Corner" addButtonUrl="/dashboard/artist-corner/create">
            <>Hello, World!</>
        </DashboardContainer>
    )
}
