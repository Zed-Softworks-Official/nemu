import React from 'react'

import { FormProvider } from '@/components/Form/FormContext'
import PortfolioAddForm from '@/components/Dashboard/Forms/PortfolioAddForm'
import DashboardContainer from '@/components/Dashboard/DashboardContainer'

export default function AddPortfolioItem() {
    return (
        <DashboardContainer title="Add Portfolio Item">
            <FormProvider>
                <PortfolioAddForm />
            </FormProvider>
        </DashboardContainer>
    )
}
