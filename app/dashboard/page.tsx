import DashboardContainer from "@/components/Dashboard/DashboardContainer";
import React from "react";


export default function Dashboard() {

    return (
        <DashboardContainer title="Artist's Dashboard">
            <div className="grid grid-cols-6">
                <div className="bg-charcoal p-10 rounded-3xl">
                    <h1>New Orders</h1>
                </div>
            </div>
        </DashboardContainer>
    )
}