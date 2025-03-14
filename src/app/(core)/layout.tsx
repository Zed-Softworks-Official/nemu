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
    Package,
    Settings,
    Truck,
    User
} from 'lucide-react'
import Link from 'next/link'

import SearchBar from '~/app/_components/search'
import { FullLogo } from '~/app/_components/ui/logo'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from '~/app/_components/ui/dropdown-menu'

import { Avatar, AvatarFallback, AvatarImage } from '~/app/_components/ui/avatar'
import { Button } from '~/app/_components/ui/button'
import { Notifications } from '~/app/_components/notifications'
import { Skeleton } from '~/app/_components/ui/skeleton'
import { type UserRole } from '~/lib/types'

import { isSupporter } from '~/app/api/stripe/sync'
import { NavigationSheet } from './navigation'

export default function StandarLayout(props: {
    children: React.ReactNode
    modal: React.ReactNode
}) {
    return (
        <main>
            <Navbar />
            <div className="relative">{props.children}</div>
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
                            <User className="size-6" />
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

    const supporter = await isSupporter(current_user?.id)

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Avatar>
                    <AvatarImage src={current_user?.imageUrl} alt="User Avatar" />
                    <AvatarFallback>
                        <User className="size-6" />
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
                    <Brush className="size-6" />
                    My Page
                </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
                <Link href={'/dashboard'} className="flex w-full items-center gap-3">
                    <BarChart className="size-6" />
                    Dashboard
                </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
                <Link
                    href={'/dashboard/settings'}
                    className="flex w-full items-center gap-3"
                >
                    <CogIcon className="size-6" />
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
                    <LayoutDashboard className="size-6" />
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
                        <CreditCard className="size-6" />
                        Billing
                    </Link>
                </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild>
                <Link href="/purchases" prefetch={true}>
                    <Package className="size-6" />
                    Purchases
                </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
                <Link prefetch={true} href={'/requests'}>
                    <Truck className="size-6" />
                    Requests
                </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
                <Link
                    prefetch={true}
                    href={props.is_artist ? '/dashboard/messages' : '/messages'}
                >
                    <Mail className="size-6" />
                    Messages
                </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
                <Link prefetch={true} href={'/u/account'}>
                    <Settings className="size-6" />
                    Account
                </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
                <SignOutButton>
                    <div className="flex w-full items-center">
                        <LogOut className="size-6" />
                        Sign out
                    </div>
                </SignOutButton>
            </DropdownMenuItem>
        </DropdownMenuGroup>
    )
}
