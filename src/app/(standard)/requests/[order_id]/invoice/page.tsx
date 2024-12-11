import { HydrateClient } from '~/trpc/server'
import Invoice from './invoice'

export default async function InvoicePage(props: {
    params: Promise<{ order_id: string }>
}) {
    const params = await props.params

    return (
        <HydrateClient>
            <Invoice order_id={params.order_id} />
        </HydrateClient>
    )
}
