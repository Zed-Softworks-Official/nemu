import React from 'react'
import DashboardContainer from '@/components/Dashboard/dashboard-container'
import ShopItems from '@/components/Dashboard/shop/shop-items'

export default function Store() {
    return (
        <DashboardContainer
            title="Aritst's Corner"
            addButtonUrl="/dashboard/shop/add"
        >
            <ShopItems />
        </DashboardContainer>
    )
}
