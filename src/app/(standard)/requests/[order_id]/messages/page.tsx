import MessagesClient from '~/components/messages/messages'

export default async function RequestMessagesPage(
    props: {
        params: Promise<{ order_id: string }>
    }
) {
    const params = await props.params;
    return <MessagesClient hide_channel_list channel_url={params.order_id} />
}
