import React from 'react'
import DashboardContainer from '@/components/Dashboard/DashboardContainer'

export default function Store() {
    return (
        <DashboardContainer
            title="Aritst's Corner"
            addButtonUrl="/dashboard/shop/add"
        >
            <div className="grid grid-cols-4"></div>
        </DashboardContainer>
    )
}
