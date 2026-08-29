import { auth } from '@clerk/nextjs/server'
import { DeviceDetail } from '~/components/dashboard/device-detail'

export default async function DeviceDetailPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    await auth.protect()
    const { id } = await params
    return <DeviceDetail deviceId={id} />
}
