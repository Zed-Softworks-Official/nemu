import { currentUser } from '@clerk/nextjs/server'

import Logo from '~/components/ui/logo'
import UserDropdown from '~/components/navbar/user-dropdown'
import SearchBar from '~/components/navbar/search-bar'

export default async function StandardNavbar() {
    const user = await currentUser()

    return (
        <div className="navbar bg-base-100 p-8">
            <div className="container mx-auto">
                <div className="flex w-full items-center justify-between gap-5">
                    <Logo />
                    {/* <SearchBar /> */}
                    <div className="flex flex-row items-center gap-5">
                        <UserDropdown user={user} />
                    </div>
                </div>
            </div>
        </div>
    )
}
