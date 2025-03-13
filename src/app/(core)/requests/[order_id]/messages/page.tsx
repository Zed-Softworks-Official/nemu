import { MessagesClient } from '~/app/_components/messages/messages-client'

export default async function MessagesPage(props: {
    params: Promise<{ order_id: string }>
}) {
    const params = await props.params

    return <MessagesClient listHidden={true} currentOrderId={params.order_id} />
}
