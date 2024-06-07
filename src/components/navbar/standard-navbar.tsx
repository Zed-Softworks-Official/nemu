import Logo from '~/components/ui/logo'
import UserDropdown from '~/components/navbar/user-dropdown'
import SearchBar from '~/components/navbar/search-bar'
import { BellIcon } from 'lucide-react'

export default function StandardNavbar() {
    return (
        <div className="navbar bg-base-100 p-8">
            <div className="container mx-auto">
                <div className="flex w-full items-center justify-between gap-5">
                    <Logo />
                    <SearchBar />
                    <div className="flex flex-row items-center gap-5">
                        <BellIcon className="h-6 w-6" />
                        <UserDropdown />
                    </div>
                </div>
            </div>
        </div>
    )
}
