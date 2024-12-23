import { MessagesClient } from '~/components/messages/messages-client'

export default async function MessagesPage(props: {
    params: Promise<{ order_id: string }>
}) {
    const params = await props.params

    return <MessagesClient list_hidden={true} current_order_id={params.order_id} />
}
