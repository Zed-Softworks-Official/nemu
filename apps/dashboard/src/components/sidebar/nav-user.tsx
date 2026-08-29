'use client'

import { useClerk, useUser } from '@clerk/nextjs'
import { Avatar, AvatarFallback, AvatarImage } from '@nemu/ui/components/avatar'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@nemu/ui/components/dropdown-menu'
import {
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    useSidebar,
} from '@nemu/ui/components/sidebar'
import { Skeleton } from '@nemu/ui/components/skeleton'
import {
    ChevronsUpDown,
    LogOutIcon,
    SettingsIcon,
    UserIcon,
} from 'lucide-react'
import Link from 'next/link'

export function NavUser() {
    const { user, isLoaded } = useUser()
    const { isMobile } = useSidebar()
    if (!isLoaded || !user) return <NavUserSkeleton />

    const displayName = userDisplayName(user)
    const email = user.primaryEmailAddress?.emailAddress
    const initials = userInitials(user)

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton
                            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                            size={'lg'}
                        >
                            <Avatar className="size-8 rounded-lg">
                                <AvatarImage
                                    alt={displayName}
                                    src={user.imageUrl}
                                />
                                <AvatarFallback>{initials}</AvatarFallback>
                            </Avatar>
                            <div className="grid flex-1 text-left text-sm leading-tight">
                                <span className="truncate font-medium">
                                    {displayName}
                                </span>
                                {email ? (
                                    <span className="truncate text-muted-foreground">
                                        {email}
                                    </span>
                                ) : null}
                            </div>
                            <ChevronsUpDown className="ml-auto size-4" />
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        align="end"
                        className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                        side={isMobile ? 'bottom' : 'right'}
                        sideOffset={4}
                    >
                        <DropdownMenuLabel>
                            <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                                <Avatar className="h-8 w-8 rounded-lg">
                                    <AvatarImage
                                        alt={displayName}
                                        src={user.imageUrl}
                                    />
                                    <AvatarFallback className="rounded-lg">
                                        {initials}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="grid flex-1 text-left text-sm leading-tight">
                                    <span className="truncate font-medium">
                                        {displayName}
                                    </span>
                                    {email ? (
                                        <span className="truncate text-xs">
                                            {email}
                                        </span>
                                    ) : null}
                                </div>
                            </div>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuGroup>
                            <DropdownMenuItem asChild>
                                <Link href={'/settings'}>
                                    <SettingsIcon className="mr-2 size-4" />
                                    Settings
                                </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                                <Link href={'/account'}>
                                    <UserIcon className="mr-2 size-4" />
                                    Account
                                </Link>
                            </DropdownMenuItem>
                        </DropdownMenuGroup>
                        <DropdownMenuSeparator />
                        <SignOutMenuItem />
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    )
}

function SignOutMenuItem() {
    const { signOut } = useClerk()

    return (
        <DropdownMenuItem
            onSelect={() => {
                void signOut({ redirectUrl: '/sign-in' })
            }}
            variant="destructive"
        >
            <LogOutIcon className="mr-2 size-4" />
            Sign out
        </DropdownMenuItem>
    )
}

function userDisplayName(user: {
    fullName: string | null
    firstName: string | null
    lastName: string | null
}) {
    const fullName = user.fullName?.trim()
    if (fullName) return fullName

    const fromParts = [user.firstName, user.lastName]
        .filter(Boolean)
        .join(' ')
        .trim()
    return fromParts || 'Account'
}

function userInitials(user: {
    firstName: string | null
    lastName: string | null
    fullName: string | null
    primaryEmailAddress?: { emailAddress: string } | null
}) {
    const fromParts = `${user.firstName?.trim().charAt(0) ?? ''}${user.lastName?.trim().charAt(0) ?? ''}`
    if (fromParts) return fromParts.toUpperCase()

    const fromFullName = user.fullName?.trim().charAt(0)
    if (fromFullName) return fromFullName.toUpperCase()

    const fromEmail = user.primaryEmailAddress?.emailAddress.charAt(0)
    if (fromEmail) return fromEmail.toUpperCase()

    return '?'
}

function NavUserSkeleton() {
    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <SidebarMenuButton size={'lg'}>
                    <Avatar className="size-8 rounded-lg">
                        <AvatarFallback>
                            <Skeleton className="size-8 rounded-lg" />
                        </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 w-24" />
                    </div>
                    <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
            </SidebarMenuItem>
        </SidebarMenu>
    )
}
