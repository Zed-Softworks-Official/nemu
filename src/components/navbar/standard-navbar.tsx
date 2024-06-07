import Logo from '~/components/ui/logo'
import UserDropdown from '~/components/navbar/user-dropdown'
import SearchBar from '~/components/navbar/search-bar'
import NotificationCenter from '~/components/navbar/notifications/notification-center'

export default function StandardNavbar() {
    return (
        <div className="navbar bg-base-100 p-8">
            <div className="container mx-auto">
                <div className="flex w-full items-center justify-between gap-5">
                    <Logo />
                    <SearchBar />
                    <div className="flex flex-row items-center gap-5">
                        <NotificationCenter />
                        <UserDropdown />
                    </div>
                </div>
            </div>
        </div>
    )
}
