import { HydrateClient } from '~/trpc/server'
import Invoice from './invoice'

export default function InvoicePage() {
    return (
        <HydrateClient>
            <Invoice />
        </HydrateClient>
    )
}
