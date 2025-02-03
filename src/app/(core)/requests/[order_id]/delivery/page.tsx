import { HydrateClient } from '~/trpc/server'
import Delivery from './delivery'

export default async function DeliveryPage() {
    return (
        <HydrateClient>
            <Delivery />
        </HydrateClient>
    )
}
