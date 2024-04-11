import AccountSettings from '@/components/account/account-settings'
import ArtistSettings from '@/components/account/artist-settings'
import DashboardContainer from '@/components/dashboard/dashboard-container'

import { api } from '@/core/api/server'
import { notFound } from 'next/navigation'

export default async function Settings() {
    const data = await api.user.get_user()

    if (!data) {
        return notFound()
    }

    return (
        <DashboardContainer title='Account Settings'>
            <div className="flex flex-col w-full gap-5">
                <div className="card bg-base-200 shadow-xl">
                    <div className="card-body">
                        <AccountSettings user={data.user} artist_id={data.artist?.id} />
                    </div>
                </div>
                {data.artist && (
                    <div className="card bg-base-200 shadow-xl">
                        <div className="card-body">
                            <h2 className="card-title">Artist Settings</h2>
                            <div className="divider"></div>
                            <ArtistSettings artist={data.artist} />
                        </div>
                    </div>
                )}
            </div>
        </DashboardContainer>
    )
}
