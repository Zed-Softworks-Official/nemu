import {
    BarChartIcon,
    BrushIcon,
    CodeIcon,
    CogIcon,
    LogInIcon,
    LogOutIcon,
    MailIcon,
    Settings2Icon,
    TruckIcon,
    UserIcon
} from 'lucide-react'

import { Avatar, AvatarImage, AvatarFallback } from '~/components/ui/avatar'
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem
} from '~/components/ui/dropdown-menu'

import Link from 'next/link'
import { SignedIn, SignedOut, SignOutButton } from '@clerk/nextjs'
import { currentUser, type User } from '@clerk/nextjs/server'
import { UserRole } from '~/core/structures'
import { Suspense } from 'react'
import { db } from '~/server/db'
import { eq } from 'drizzle-orm'
import { users } from '~/server/db/schema'

export default function UserDropdown() {
    return (
        <Suspense fallback={<div className="skeleton h-10 w-10"></div>}>
            <Menu />
        </Suspense>
    )
}

async function Menu() {
    const current_user = await currentUser()

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <div className="cursor-pointer">
                    <SignedIn>
                        <Avatar>
                            <AvatarImage src={current_user?.imageUrl} alt="Avatar" />
                            <AvatarFallback>
                                <UserIcon className="h-6 w-6" />
                            </AvatarFallback>
                        </Avatar>
                    </SignedIn>
                    <SignedOut>
                        <UserIcon className="h-6 w-6" />
                    </SignedOut>
                </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="min-w-52">
                <SignedIn>
                    <UserDropdownContent user={current_user!} />
                </SignedIn>
                <SignedOut>
                    <DropdownMenuItem>
                        <Link href="/u/login" className="flex w-full items-center gap-3">
                            <LogInIcon className="h-6 w-6" />
                            Log in
                        </Link>
                    </DropdownMenuItem>
                </SignedOut>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

async function UserDropdownContent(props: { user: User }) {
    const current_user = await db.query.users.findFirst({
        where: eq(users.clerk_id, props.user.id)
    })

    const messages_url = current_user?.artist_id ? '/dashboard/messsages' : '/messages'

    return (
        <>
            {current_user?.role === UserRole.Artist && (
                <>
                    <DropdownMenuItem>
                        <Link
                            prefetch={true}
                            href={`/@${props.user.publicMetadata.handle as string}`}
                            className="flex w-full items-center gap-3"
                        >
                            <BrushIcon className="h-6 w-6" />
                            My Page
                        </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                        <Link
                            prefetch={true}
                            href={`/dashboard`}
                            className="flex w-full items-center gap-3"
                        >
                            <BarChartIcon className="h-6 w-6" />
                            Artist&apos;s Dashboard
                        </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                        <Link
                            prefetch={true}
                            href={`/dashboard/settings`}
                            className="flex w-full items-center gap-3"
                        >
                            <CogIcon className="h-6 w-6" />
                            Artist Settings
                        </Link>
                    </DropdownMenuItem>
                </>
            )}
            {current_user?.role === UserRole.Admin && (
                <>
                    <DropdownMenuItem>
                        <Link
                            prefetch={true}
                            href={'/admin/gen-code'}
                            className="flex w-full items-center gap-3"
                        >
                            <CodeIcon className="h-6 w-6" />
                            Generate Artist Code
                        </Link>
                    </DropdownMenuItem>
                </>
            )}
            <DropdownMenuItem>
                <Link
                    prefetch={true}
                    href={'/requests'}
                    className="flex w-full items-center gap-3"
                >
                    <TruckIcon className="h-6 w-6" />
                    Requests
                </Link>
            </DropdownMenuItem>
            {current_user?.has_sendbird_account && (
                <DropdownMenuItem>
                    <Link
                        prefetch={true}
                        href={messages_url}
                        className="flex w-full items-center gap-3"
                    >
                        <MailIcon className="h-6 w-6" />
                        Messages
                    </Link>
                </DropdownMenuItem>
            )}
            <DropdownMenuItem>
                <Link
                    prefetch={true}
                    href={'/u/account'}
                    className="flex w-full items-center gap-3"
                >
                    <Settings2Icon className="h-6 w-6" />
                    Account
                </Link>
            </DropdownMenuItem>
            <DropdownMenuItem>
                <SignOutButton>
                    <div className="flex w-full items-center gap-3">
                        <LogOutIcon className="h-6 w-6" />
                        Sign out
                    </div>
                </SignOutButton>
            </DropdownMenuItem>
        </>
    )
}
