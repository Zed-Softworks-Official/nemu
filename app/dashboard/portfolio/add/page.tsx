import React from 'react'

import DashboardContainer from '@/components/dashboard/dashboard-container'
import PortfolioCreateEditForm from '@/components/dashboard/forms/portfolio-create-edit-form'
import UploadProvider from '@/components/upload/upload-context'
import { getServerAuthSession } from '@/core/auth'
import { redirect } from 'next/navigation'

export default async function AddPortfolioItem() {
    const session = await getServerAuthSession()

    if (!session) {
        return redirect('/dashboard')
    }

    return (
        <DashboardContainer title="Add Portfolio Item">
            <UploadProvider>
                <PortfolioCreateEditForm user={session?.user} />
            </UploadProvider>
        </DashboardContainer>
    )
}
