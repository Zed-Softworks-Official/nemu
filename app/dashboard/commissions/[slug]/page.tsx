import DashboardContainer from '@/components/dashboard/dashboard-container'
import CommissionFormSubmissions from '@/components/form-builder/submissions/commission-form-submissions'

export default function CommissionsOverviewPage() {
    return (
        <>
            <DashboardContainer title="Overview for Commission">
                <h1>Hello, World!</h1>
            </DashboardContainer>
            <DashboardContainer title="Requests">
                <CommissionFormSubmissions form_id="6599e94581a036161c6130eb" />
            </DashboardContainer>
        </>
    )
}
