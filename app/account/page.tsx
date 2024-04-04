import AccountSettings from '@/components/account/account-settings'
import DefaultPageLayout from '../(default)/layout'
import { api } from '@/core/trpc/server'

export default async function AccountPage() {
    const user = await api.user.get_user()

    return (
        <DefaultPageLayout>
            <div className="card bg-base-300 shadow-xl">
                <div className="card-body">
                    <h2 className="card-title">Account Settings</h2>
                    <div className="divider"></div>
                    <AccountSettings user={user} />
                </div>
            </div>
        </DefaultPageLayout>
    )
}
