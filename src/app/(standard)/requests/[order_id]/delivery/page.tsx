import { HydrateClient } from '~/trpc/server'
import Delivery from './delivery'

export default async function DeliveryPage(props: {
    params: Promise<{ order_id: string }>
}) {
    const params = await props.params

    return (
        <HydrateClient>
            <Delivery order_id={params.order_id} />
        </HydrateClient>
    )
}
