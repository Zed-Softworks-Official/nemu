import { Suspense } from 'react'
import { SignedIn, SignedOut, SignOutButton } from '@clerk/nextjs'
import { currentUser } from '@clerk/nextjs/server'
import {
    BarChart,
    Brush,
    Code,
    CogIcon,
    LogOut,
    Mail,
    Settings,
    Truck,
    User
} from 'lucide-react'

import SearchBar from '~/components/search'
import { FullLogo } from '~/components/ui/logo'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from '~/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { unstable_cache } from 'next/cache'
import { db } from '~/server/db'
import { eq } from 'drizzle-orm'
import { users } from '~/server/db/schema'
import Link from 'next/link'
import { UserRole } from '~/types/enum'
import { Button } from '~/components/ui/button'

const get_user_profile = unstable_cache(async (user_id?: string) => {
    if (!user_id) return undefined

    return await db.query.users.findFirst({
        where: eq(users.clerk_id, user_id)
    })
})

export default function StandarLayout(props: { children: React.ReactNode }) {
    return (
        <main className="container mx-auto min-h-screen w-full">
            <Navbar />
            <div className="py-5">{props.children}</div>
            <Footer />
        </main>
    )
}

function Navbar() {
    return (
        <header className="flex w-full items-center justify-between gap-5 py-5">
            <FullLogo />
            <SearchBar />
            <nav>
                <SignedIn>
                    <Suspense fallback={<div>Loading...</div>}>
                        <UserDropdown />
                    </Suspense>
                </SignedIn>
                <SignedOut>
                    <Button className="h-12 rounded-full" variant={'ghost'} asChild>
                        <Link prefetch={true} href={'/u/login'}>
                            <User className="h-12 w-12" />
                        </Link>
                    </Button>
                </SignedOut>
            </nav>
        </header>
    )
}

function Footer() {
    return <footer>Footer</footer>
}

async function UserDropdown() {
    const current_user = await currentUser()
    const user_profile = await get_user_profile(current_user?.id)

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Avatar>
                    <AvatarImage src={current_user?.imageUrl} alt="User Avatar" />
                    <AvatarFallback>
                        <User className="h-6 w-6" />
                    </AvatarFallback>
                </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
                <ArtistSection
                    handle={current_user?.publicMetadata.handle as string}
                    show={user_profile?.role === UserRole.Artist}
                />
                <AdminSection show={user_profile?.role === UserRole.Admin} />
                <GeneralSection
                    is_artist={user_profile?.role === UserRole.Artist}
                    has_sendbird_account={user_profile?.has_sendbird_account ?? false}
                />
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

function ArtistSection(props: { show?: boolean; handle: string }) {
    if (!props.show) return null

    return (
        <DropdownMenuGroup>
            <DropdownMenuLabel>Artist</DropdownMenuLabel>
            <DropdownMenuItem asChild>
                <Link
                    className="flex w-full items-center gap-3"
                    href={`/@${props.handle}`}
                >
                    <Brush className="h-6 w-6" />
                    My Page
                </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
                <Link href={'/dashboard'} className="flex w-full items-center gap-3">
                    <BarChart className="h-6 w-6" />
                    Artist&apos;s Dashboard
                </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
                <Link
                    href={'/dashboard/settings'}
                    className="flex w-full items-center gap-3"
                >
                    <CogIcon className="h-6 w-6" />
                    Artist Settings
                </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
        </DropdownMenuGroup>
    )
}

function AdminSection(props: { show?: boolean }) {
    if (!props.show) return null

    return (
        <DropdownMenuGroup>
            <DropdownMenuLabel>Admin</DropdownMenuLabel>

            <DropdownMenuItem asChild>
                <Link href={'/admin/gen-code'} className="flex w-full items-center gap-3">
                    <Code className="h-6 w-6" />
                    Generate Artist Code
                </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
        </DropdownMenuGroup>
    )
}

function GeneralSection(props: { is_artist: boolean; has_sendbird_account: boolean }) {
    return (
        <DropdownMenuGroup>
            <DropdownMenuLabel>General</DropdownMenuLabel>
            <DropdownMenuItem asChild>
                <Link
                    prefetch={true}
                    href={'/requests'}
                    className="flex w-full items-center gap-3"
                >
                    <Truck className="h-6 w-6" />
                    Requests
                </Link>
            </DropdownMenuItem>
            {props.has_sendbird_account && (
                <DropdownMenuItem asChild>
                    <Link
                        prefetch={true}
                        href={props.is_artist ? '/dashboard/messages' : '/messages'}
                        className="flex w-full items-center gap-3"
                    >
                        <Mail className="h-6 w-6" />
                        Messages
                    </Link>
                </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild>
                <Link
                    prefetch={true}
                    href={'/u/account'}
                    className="flex w-full items-center gap-3"
                >
                    <Settings className="h-6 w-6" />
                    Account
                </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
                <SignOutButton>
                    <div className="flex w-full items-center gap-3">
                        <LogOut className="h-6 w-6" />
                        Sign out
                    </div>
                </SignOutButton>
            </DropdownMenuItem>
        </DropdownMenuGroup>
    )
}
