import React from 'react'
import DashboardContainer from '@/components/dashboard/dashboard-container'
import ShopItems from '@/components/dashboard/shop/shop-items'

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
