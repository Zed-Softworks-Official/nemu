import DefaultPageLayout from '@/app/(default)/layout'
import { VerifyTable } from '@/components/artist-verification/verify-table'

export default function VerifyArtist() {
    return (
        <DefaultPageLayout>
            <main className="container mx-auto bg-fullwhite dark:bg-fullblack p-5 rounded-3xl text-center">
                <VerifyTable />
            </main>
        </DefaultPageLayout>
    )
}
