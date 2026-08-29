import { auth } from '@clerk/nextjs/server'
import { PageHeader } from '~/components/dashboard/page-header'
import { RoomsManager } from '~/components/dashboard/rooms-manager'

export default async function RoomsPage() {
    await auth.protect()

    return (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
            <PageHeader
                description="Create, rename, and remove rooms used to organize your devices."
                title="Rooms"
            />
            <RoomsManager />
        </div>
    )
}
