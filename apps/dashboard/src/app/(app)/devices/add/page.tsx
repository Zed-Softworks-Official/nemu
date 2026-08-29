import { auth } from '@clerk/nextjs/server'
import { DevicePairingWizard } from '~/components/dashboard/device-pairing-wizard'

export default async function AddDevicePage() {
    await auth.protect()
    return <DevicePairingWizard />
}
