import { DeviceDetail } from '~/components/dashboard/device-detail'

export default async function DeviceDetailPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    return <DeviceDetail deviceId={id} />
}
