import { getServerAuthSession } from '@/app/api/auth/[...nextauth]/route'
import UserDropdown from './user-dropdown'

export default async function UserInfoMenu() {
    const session = await getServerAuthSession()

    return <UserDropdown session={session} />
}