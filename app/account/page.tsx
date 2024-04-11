import AccountSettings from '@/components/account/account-settings'
import DefaultPageLayout from '../(default)/layout'
import { api } from '@/core/api/server'
import ArtistSettings from '@/components/account/artist-settings'
import { notFound } from 'next/navigation'

export default async function AccountPage() {
    const data = await api.user.get_user()

    if (!data) {
        return notFound()
    }

    return (
        <DefaultPageLayout>
            <div className="flex flex-col w-full gap-5">
                <div className="card bg-base-300 shadow-xl">
                    <div className="card-body">
                        <h2 className="card-title">Account Settings</h2>
                        <div className="divider"></div>
                        <AccountSettings user={data.user} artist_id={data.artist?.id} />
                    </div>
                </div>
                {data.artist && (
                    <div className="card bg-base-300 shadow-xl">
                        <div className="card-body">
                            <h2 className="card-title">Artist Settings</h2>
                            <div className="divider"></div>
                            <ArtistSettings artist={data.artist} />
                        </div>
                    </div>
                )}
            </div>
        </DefaultPageLayout>
    )
}
