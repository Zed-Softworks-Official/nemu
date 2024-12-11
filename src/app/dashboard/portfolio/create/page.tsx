import UploadThingProvider from '~/components/files/uploadthing-context'
import { CreateForm } from '../form'

export default function DashboardPortfolioCreatePage() {
    return (
        <div className="container mx-auto">
            <UploadThingProvider endpoint="portfolioUploader">
                <CreateForm />
            </UploadThingProvider>
        </div>
    )
}
