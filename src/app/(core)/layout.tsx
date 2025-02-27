import { Suspense } from 'react'
import { RedirectToSignIn, SignedIn, SignedOut, SignOutButton } from '@clerk/nextjs'
import { currentUser } from '@clerk/nextjs/server'
import {
    BarChart,
    Brush,
    CogIcon,
    CreditCard,
    LayoutDashboard,
    LogOut,
    Mail,
    Settings,
    Truck,
    User
} from 'lucide-react'
import Link from 'next/link'

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
import { Button } from '~/components/ui/button'
import { Notifications } from '~/components/notifications'
import { Skeleton } from '~/components/ui/skeleton'
import { type UserRole } from '~/lib/structures'

import { is_supporter } from '~/app/api/stripe/sync'
import { NavigationSheet } from './navigation'

export default function StandarLayout(props: {
    children: React.ReactNode
    modal: React.ReactNode
}) {
    return (
        <main>
            <div className="flex min-h-screen w-full flex-1 flex-col">
                <Navbar />
                <div className="relative">{props.children}</div>
            </div>
            {props.modal}
        </main>
    )
}

function Navbar() {
    return (
        <header className="container mx-auto flex w-full items-center justify-between gap-5 px-10 py-5 sm:px-0">
            <FullLogo />

            <div className="flex items-center gap-5">
                <SearchBar />
                <SignedIn>
                    <Notifications />
                    <Suspense fallback={<Skeleton className="h-12 w-12 rounded-full" />}>
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
                <NavigationSheet />
            </div>
        </header>
    )
}

async function UserDropdown() {
    const current_user = await currentUser()

    if (!current_user) {
        return <RedirectToSignIn />
    }

    const supporter = await is_supporter(current_user?.id)

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
            <DropdownMenuContent className="min-w-[200px]" align="end">
                <ArtistSection
                    handle={current_user?.publicMetadata.handle as string}
                    show={(current_user?.publicMetadata.role as UserRole) === 'artist'}
                />
                <AdminSection
                    show={(current_user?.publicMetadata.role as UserRole) === 'admin'}
                />
                <GeneralSection
                    is_artist={
                        (current_user?.publicMetadata.role as UserRole) === 'artist'
                    }
                    supporter={supporter}
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
                    Dashboard
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
                <Link href={'/admin'} className="flex w-full items-center gap-3">
                    <LayoutDashboard className="h-6 w-6" />
                    Admin Dashboard
                </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
        </DropdownMenuGroup>
    )
}

function GeneralSection(props: { is_artist: boolean; supporter: boolean }) {
    return (
        <DropdownMenuGroup>
            <DropdownMenuLabel>General</DropdownMenuLabel>
            {props.supporter && (
                <DropdownMenuItem asChild>
                    <Link href={'/supporter/portal'}>
                        <CreditCard className="h-6 w-6" />
                        Billing
                    </Link>
                </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild>
                <Link prefetch={true} href={'/requests'}>
                    <Truck className="h-6 w-6" />
                    Requests
                </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
                <Link
                    prefetch={true}
                    href={props.is_artist ? '/dashboard/messages' : '/messages'}
                >
                    <Mail className="h-6 w-6" />
                    Messages
                </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
                <Link prefetch={true} href={'/u/account'}>
                    <Settings className="h-6 w-6" />
                    Account
                </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
                <SignOutButton>
                    <div className="flex w-full items-center">
                        <LogOut className="h-6 w-6" />
                        Sign out
                    </div>
                </SignOutButton>
            </DropdownMenuItem>
        </DropdownMenuGroup>
    )
}
