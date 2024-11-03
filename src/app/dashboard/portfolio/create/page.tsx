import UploadThingProvider from '~/components/files/uploadthing-context'

import { PortfolioCreateForm } from '~/components/dashboard/forms/portfolio-form'

export default function CreatePortfolioPage() {
    return (
        <div className="container mx-auto mt-3 p-10">
            <UploadThingProvider endpoint="portfolioUploader">
                <PortfolioCreateForm />
            </UploadThingProvider>
        </div>
    )
}
