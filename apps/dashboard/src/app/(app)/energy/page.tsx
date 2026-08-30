import { auth } from '@clerk/nextjs/server'
import { EnergyDashboard } from '~/components/dashboard/energy-dashboard'

export default async function EnergyPage() {
    await auth.protect()

    return <EnergyDashboard />
}
