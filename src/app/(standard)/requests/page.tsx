import { HydrateClient } from '~/trpc/server'
import RequestTable from './request-table'

export default function RequestsPage() {
    return (
        <HydrateClient>
            <RequestTable />
        </HydrateClient>
    )
}
