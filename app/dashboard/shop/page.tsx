import React from 'react'
import DashboardContainer from '@/components/Dashboard/DashboardContainer'
import ShopItems from '@/components/Dashboard/Shop/ShopItems'

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
