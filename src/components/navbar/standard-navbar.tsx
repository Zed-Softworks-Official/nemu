import Logo from '~/components/ui/logo'
import { ThemeToggle } from '~/components/navbar/theme-toggle'
import { getServerAuthSession } from '~/server/auth'
import UserDropdown from '~/components/navbar/user-dropdown'

export default async function StandardNavbar() {
    const session = await getServerAuthSession()

    return (
        <div className="fixed p-5 bg-background/60 backdrop-blur-2xl w-full">
            <div className="container mx-auto">
                <div className="flex justify-between items-center w-full gap-5">
                    <Logo />
                    <div className="flex gap-5">
                        <UserDropdown user={session?.user} />
                        <ThemeToggle />
                    </div>
                </div>
            </div>
        </div>
    )
}
