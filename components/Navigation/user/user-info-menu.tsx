import { getServerAuthSession } from '@/app/api/auth/[...nextauth]/route'
import UserDropdown from './user-dropdown'
import { api } from '@/core/trpc/server'

export default async function UserInfoMenu() {
    const user = await api.user.get_user()

    return <UserDropdown data={user} />
}
