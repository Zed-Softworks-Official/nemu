import React from 'react'

import { FormProvider } from '@/components/form/form-context'
import PortfolioAddForm from '@/components/dashboard/forms/portfolio-add-form'
import DashboardContainer from '@/components/dashboard/dashboard-container'

export default function AddPortfolioItem() {
    return (
        <DashboardContainer title="Add Portfolio Item">
            <FormProvider>
                <PortfolioAddForm />
            </FormProvider>
        </DashboardContainer>
    )
}
