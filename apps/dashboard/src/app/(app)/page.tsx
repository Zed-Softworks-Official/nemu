import { auth } from '@clerk/nextjs/server'
import { HomeDashboard } from '~/components/dashboard/home-dashboard'

export default async function DashboardPage() {
    await auth.protect()
    return <HomeDashboard />
}
