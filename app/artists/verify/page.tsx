import DefaultPageLayout from '@/app/(default)/layout'
import { VerifyTable } from '@/components/ArtistVerification/VerifyTable'
import AuthCheck from '@/components/Auth/AuthCheck'

export default function VerifyArtist() {    
    return (
        <DefaultPageLayout>
            <AuthCheck admin_only>
                <main className="container mx-auto bg-fullwhite dark:bg-fullblack p-5 rounded-3xl text-center">
                    <VerifyTable />
                </main>
            </AuthCheck>
        </DefaultPageLayout>
    )
}
