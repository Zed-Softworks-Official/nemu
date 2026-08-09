import { RoomsManager } from '~/components/dashboard/rooms-manager'
import { PageHeader } from '~/components/dashboard/page-header'

export default function RoomsPage() {
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
