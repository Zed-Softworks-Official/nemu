import DashboardContainer from '@/components/dashboard/dashboard-container'
import DownloadsList from '@/components/dashboard/downloads/downloads'

export default function DownloadPage() {
    return (
        <DashboardContainer title="Downloads">
            <DownloadsList />
        </DashboardContainer>
    )
}
