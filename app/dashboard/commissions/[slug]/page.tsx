import { getServerAuthSession } from "@/core/auth";
import { api } from "@/core/trpc/server";

export default async function CommissionsOverviewPage({params}: {params: {slug: string}}) {
    const session = await getServerAuthSession()
    // const commissions = await api.commissions.get_commission_data()

    // return <DashboardCommissionDetail slug={params.slug} /> 
    return null
}
