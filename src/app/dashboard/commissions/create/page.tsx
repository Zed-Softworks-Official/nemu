import UploadThingProvider from '~/components/files/uploadthing-context'
import { CreateForm } from '../form'

export default function CreateCommissionPage() {
    return (
        <UploadThingProvider endpoint="commissionImageUploader">
            <CreateForm />
        </UploadThingProvider>
    )
}
