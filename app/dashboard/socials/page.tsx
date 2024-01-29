import DashboardContainer from '@/components/dashboard/dashboard-container'
import SocialEditor from '@/components/dashboard/socials/social-editor'

export default function DashboardSocialsPage() {
    return (
        <DashboardContainer title="Socials" breadcrumbs>
            <SocialEditor />
        </DashboardContainer>
    )
}
