import DashboardContainer from "@/components/dashboard/dashboard-container";
import CommissionCreateForm from "@/components/dashboard/forms/commission-create-form";

export default function DashboardFormAdd() {
    return (
        <DashboardContainer title="Create New Form">
            <CommissionCreateForm />
        </DashboardContainer>
    )
}