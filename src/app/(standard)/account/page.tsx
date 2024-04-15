import AccountSettings from '~/components/settings/account-settings'
import { api } from '~/trpc/server'

export default async function AccountPage() {
    const data = await api.user.get_user()

    return (
        <div className="flex flex-col w-full gap-5">
            <div className="card bg-base-300 shadow-xl">
                <div className="card-body">
                    <h2 className="card-title">Account Settings</h2>
                    <div className="divider"></div>
                    <AccountSettings />
                </div>
                {/* user={data.user} artist_id={data.artist?.id} */}
            </div>
            {data?.artist && (
                // <div className="card bg-base-300 shadow-xl">
                //     <div className="card-body">
                //         <h2 className="card-title">Artist Settings</h2>
                //         <div className="divider"></div>
                //         {/* <ArtistSettings artist={data.artist} /> */}
                //     </div>
                // </div>
                <></>
            )}
        </div>
    )
}
