import MessagesClient from '~/components/messages/messages'

export default function RequestMessagesPage({
    params
}: {
    params: { order_id: string }
}) {
    return <MessagesClient hide_channel_list channel_url={params.order_id} />
}
