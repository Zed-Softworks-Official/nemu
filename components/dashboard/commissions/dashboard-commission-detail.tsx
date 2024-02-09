'use client'

import { useDashboardContext } from '@/components/navigation/dashboard/dashboard-context'

import DashboardContainer from '../dashboard-container'
import CommissionFormSubmissions from '@/components/form-builder/submissions/commission-form-submissions'

export default function DashboardCommissionDetail({ slug }: { slug: string }) {
    const { artistId } = useDashboardContext()

    return (
        <DashboardContainer title={slug}>
            <h1>Hello, World!</h1>
        </DashboardContainer>
    )
}
