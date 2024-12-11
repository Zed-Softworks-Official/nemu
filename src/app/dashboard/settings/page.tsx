import UploadThingProvider from '~/components/files/uploadthing-context'
import { SettingsForm } from './form'

export default function SettingsPage() {
    return (
        <div className="container mx-auto w-full max-w-xl">
            <UploadThingProvider endpoint="headerPhotoUploader">
                <SettingsForm />
            </UploadThingProvider>
        </div>
    )
}
