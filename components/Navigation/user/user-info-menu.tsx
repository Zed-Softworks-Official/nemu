import { getServerAuthSession } from '@/core/auth'
import UserDropdown from './user-dropdown'
import { api } from '@/core/api/server'
import { RouterOutput } from '@/core/responses'

export default async function UserInfoMenu() {
    const session = await getServerAuthSession()

    let user: RouterOutput['user']['get_user'] = undefined
    if (session) {
        user = await api.user.get_user()
    }

    return <UserDropdown data={user} />
}
