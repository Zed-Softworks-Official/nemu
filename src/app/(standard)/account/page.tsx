import { notFound } from 'next/navigation'

import AccountSettings from '~/components/settings/account-settings'
import ArtistSettings from '~/components/settings/artist-settings'
import Container from '~/components/ui/container'

import { api } from '~/trpc/server'

export const metadata = {
    title: 'Nemu | Account'
}

export default async function AccountPage() {
    const data = await api.user.get_user()

    if (!data) {
        return notFound()
    }

    return (
        <div className="flex flex-col w-full gap-5">
            <Container>
                <h2 className="card-title">Account Settings</h2>
                <div className="divider"></div>
                <AccountSettings user={data.user} artist_id={data.artist?.id} />
            </Container>

            {data.artist && (
                <Container>
                    <h2 className="card-title">Artist Settings</h2>
                    <div className="divider"></div>
                    <ArtistSettings artist={data.artist} />
                </Container>
            )}
        </div>
    )
}
