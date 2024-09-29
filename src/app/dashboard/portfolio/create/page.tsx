import UploadThingProvider from '~/components/files/uploadthing-context'
import DashboardContainer from '~/components/ui/dashboard-container'

import { PortfolioCreateForm } from '~/components/dashboard/forms/portfolio-form'

export default function CreatePortfolioPage() {
    return (
        <DashboardContainer title="Create Portfolio Item">
            <UploadThingProvider endpoint="portfolioUploader">
                <PortfolioCreateForm />
            </UploadThingProvider>
        </DashboardContainer>
    )
}
