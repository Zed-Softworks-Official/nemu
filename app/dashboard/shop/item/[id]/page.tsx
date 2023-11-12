import DashboardContainer from "@/components/Dashboard/dashboard-container";
import ShopEditForm from "@/components/dashboard/forms/shop-edit-form";
import { FormProvider } from "@/components/form/form-context";

export default function ShopItemEdit() {
    return (
        <DashboardContainer title="Edit Artist's Corner Product">
            <FormProvider>
                <ShopEditForm />
            </FormProvider>
        </DashboardContainer>
    )
}