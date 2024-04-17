import PortfolioCreateEditForm from '~/components/dashboard-forms/portfolio-create-edit'
import UploadThingProvider from '~/components/files/uploadthing-context'
import DashboardContainer from '~/components/ui/dashboard-container'

export default function CreatePortfolioPage() {
    return (
        <DashboardContainer title="Create Portfolio Item">
            <UploadThingProvider endpoint='portfolioUploader'>
                <PortfolioCreateEditForm />
            </UploadThingProvider>
        </DashboardContainer>
    )
}
