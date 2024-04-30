import Logo from '~/components/ui/logo'
import UserDropdown from '~/components/navbar/user-dropdown'

export default async function StandardNavbar() {
    return (
        <div className="navbar bg-base-100 p-8">
            <div className="container mx-auto">
                <div className="flex w-full items-center justify-between gap-5">
                    <Logo />
                    <div className="flex flex-row items-center gap-5">
                        <UserDropdown />
                    </div>
                </div>
            </div>
        </div>
    )
}
