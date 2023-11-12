import React from 'react'

import { FormProvider } from '@/components/form/form-context'
import PortfolioAddForm from '@/components/Dashboard/forms/portfolio-add-form'
import DashboardContainer from '@/components/Dashboard/dashboard-container'

export default function AddPortfolioItem() {
    return (
        <DashboardContainer title="Add Portfolio Item">
            <FormProvider>
                <PortfolioAddForm />
            </FormProvider>
        </DashboardContainer>
    )
}
