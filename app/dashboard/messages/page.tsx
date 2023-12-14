import MessagesClient from '@/components/messages/messages-client'
import DashboardContainer from '@/components/dashboard/dashboard-container'

export default function DashboardMessages() {
    return (
        <DashboardContainer title="Messages">
            <MessagesClient />
        </DashboardContainer>
    )
}
