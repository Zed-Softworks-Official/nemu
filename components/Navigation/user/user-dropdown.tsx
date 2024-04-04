'use client'

import { Session } from 'next-auth'
import { Role, UserInfoItem } from '@/core/structures'
import { Fragment, useMemo } from 'react'
import { Menu, Transition } from '@headlessui/react'
import NemuImage from '@/components/nemu-image'
import Link from 'next/link'
import ThemeSwitcher from '@/components/theme/theme-switcher'
import { cn } from '@/lib/utils'

import {
    ArrowDownTrayIcon,
    ArrowRightEndOnRectangleIcon,
    ArrowRightStartOnRectangleIcon,
    BanknotesIcon,
    ChartBarIcon,
    CheckCircleIcon,
    CodeBracketIcon,
    Cog6ToothIcon,
    EnvelopeIcon,
    FingerPrintIcon,
    PaintBrushIcon,
    StarIcon,
    TruckIcon,
    UserIcon
} from '@heroicons/react/20/solid'

export default function UserDropdown({ session }: { session: Session | null }) {
    const items = useMemo(() => {
        if (!session) {
            return []
        }

        let result: UserInfoItem[] = [
            {
                title: 'Favorites',
                url: '/favorites',
                icon: <StarIcon className="w-6 h-6" />
            },
            {
                title: 'Requests',
                url: '/requests',
                icon: <TruckIcon className="w-6 h-6" />
            },
            {
                title: 'Messages',
                url: '/messages',
                icon: <EnvelopeIcon className="w-6 h-6" />
            },
            {
                title: 'Account Settings',
                url: '/account',
                icon: <Cog6ToothIcon className="w-6 h-6" />
            }
        ]

        switch (session.user.role) {
            case Role.Artist:
                {
                    result = [
                        {
                            title: 'My Page',
                            url: 'value',
                            icon: <PaintBrushIcon className="w-6 h-6" />
                        },
                        {
                            title: 'Artist Dashboard',
                            url: '/dashboard',
                            icon: <ChartBarIcon className="w-6 h-6" />
                        },
                        ...result
                    ]
                }
                break
            case Role.Admin:
                {
                    result = [
                        {
                            title: 'Verify Artists',
                            url: '/artists/verify',
                            icon: <CheckCircleIcon className="w-6 h-6" />
                        },
                        {
                            title: 'Generate Artist Code',
                            url: '/artist/gen-code',
                            icon: <FingerPrintIcon className="w-6 h-6" />
                        },
                        ...result
                    ]
                }
                break
        }

        return result
    }, [session])

    return (
        <div className="">
            <Menu as="div" className="relative inline-block text-left">
                <div>
                    <Menu.Button className="inline-flex w-20 justify-center px-4 py-2 text-base-content btn btn-circle btn-ghost hover:bg-transparent rounded-full">
                        {session?.user ? (
                            session?.user?.image ? (
                                <NemuImage
                                    src={session?.user?.image!}
                                    alt="profile image"
                                    width={50}
                                    height={50}
                                    className="rounded-full w-16"
                                />
                            ) : (
                                <NemuImage
                                    src={'/profile.png'}
                                    alt="profile image"
                                    width={50}
                                    height={50}
                                    className="avatar rounded-full w-16"
                                />
                            )
                        ) : (
                            <UserIcon className="w-6 h-6" />
                        )}
                    </Menu.Button>
                </div>
                <Transition
                    as={Fragment}
                    enter="transition ease-out duration-100"
                    enterFrom="transform opacity-0 scale-95"
                    enterTo="transform opacity-100 scale-100"
                    leave="transition ease-in duration-75"
                    leaveFrom="transform opacity-100 scale-100"
                    leaveTo="transform opacity-0 scale-95"
                >
                    <Menu.Items className="absolute z-10 right-0 mt-2 w-56 origin-top-right divide-y divide-gray-100 rounded-md bg-base-300 shadow-lg">
                        <div className="px-1 py-1 ">
                            {items.map((item) => (
                                <Menu.Item key={item.title}>
                                    {({ active }) => (
                                        <Link
                                            href={item.url}
                                            className={cn(
                                                'flex justify-start items-center gap-5 w-full px-5 py-2 text-sm text-base-content',
                                                active ? 'bg-base-100' : 'bg-base-300'
                                            )}
                                        >
                                            {item.icon}
                                            {item.title}
                                        </Link>
                                    )}
                                </Menu.Item>
                            ))}
                            {session ? (
                                <Menu.Item>
                                    {({ active }) => (
                                        <Link
                                            href={'/api/auth/signout'}
                                            className={cn(
                                                'flex justify-start items-center gap-5 w-full px-5 py-2 text-sm text-base-content',
                                                active ? 'bg-base-100' : 'bg-base-300'
                                            )}
                                        >
                                            <ArrowRightStartOnRectangleIcon className="w-6 h-6" />
                                            Sign out
                                        </Link>
                                    )}
                                </Menu.Item>
                            ) : (
                                <Menu.Item>
                                    {({ active }) => (
                                        <Link
                                            href={'/u/login'}
                                            className={cn(
                                                'flex justify-start items-center gap-5 w-full px-5 py-2 text-sm text-base-content',
                                                active ? 'bg-base-100' : 'bg-base-300'
                                            )}
                                        >
                                            <ArrowRightEndOnRectangleIcon className="w-6 h-6" />
                                            Sign in
                                        </Link>
                                    )}
                                </Menu.Item>
                            )}
                            <Menu.Item>
                                {({ active }) => <ThemeSwitcher active={active} />}
                            </Menu.Item>
                        </div>
                    </Menu.Items>
                </Transition>
            </Menu>
        </div>
    )
}

// export default function UserInfoMenu() {
//     const { data: session } = useSession()

//     /////////////////////////////////
//     // Get the correct Navbar items
//     /////////////////////////////////
//     function GetCurrentNavbarItems(session: boolean, role: Role, handle?: string) {
//         // Check if we have a session
//         if (session) {
//             // If we're not an artist then we're a standard user
//             switch (role) {
//                 case Role.Artist:
//                     let infoObject = UserInfoObject.Artist
//                     infoObject[0].path = `/@${handle}`

//                     return infoObject.concat(UserInfoObject.Standard)
//                 case Role.Admin:
//                     return UserInfoObject.Admin.concat(UserInfoObject.Standard)
//             }

//             return UserInfoObject.Standard
//         }

//         return UserInfoObject.SignedOut
//     }

//     /////////////////////////////////
//     // Convert Enum to Component
//     /////////////////////////////////
//     function ConvertUserIconEnumToReactDOM(icon: UserInfoIcon) {
//         switch (icon) {
//             case UserInfoIcon.Page:
//                 return <PaintBrushIcon className="w-6 h-6" />
//             case UserInfoIcon.Dashboard:
//                 return <ChartBarIcon className="w-6 h-6" />
//             case UserInfoIcon.Favourite:
//                 return <StarIcon className="w-6 h-6" />
//             case UserInfoIcon.Messages:
//                 return <EnvelopeIcon className="w-6 h-6" />
//             case UserInfoIcon.Settings:
//                 return <Cog6ToothIcon className="w-6 h-6" />
//             case UserInfoIcon.SignIn:
//                 return <ArrowRightEndOnRectangleIcon className="w-6 h-6" />
//             case UserInfoIcon.SignOut:
//                 return <ArrowRightStartOnRectangleIcon className="w-6 h-6" />
//             case UserInfoIcon.Verify:
//                 return <CheckCircleIcon className="w-6 h-6" />
//             case UserInfoIcon.Code:
//                 return <CodeBracketIcon className="w-6 h-6" />
//         }
//     }

//     // initialize the navbar items
//     let navbar_items: UserInfoLink[] = GetCurrentNavbarItems(
//         session ? true : false,
//         session?.user.role!,
//         session?.user.handle
//     )

//     return (
//         <div className="">
//             <Menu as="div" className="relative inline-block text-left">
//                 <div>
//                     <Menu.Button className="inline-flex w-20 justify-center px-4 py-2 text-base-content btn btn-circle btn-ghost hover:bg-transparent rounded-full">
//                         {session?.user ? (
//                             session?.user?.image ? (
//                                 <NemuImage
//                                     src={session?.user?.image!}
//                                     alt="profile image"
//                                     width={50}
//                                     height={50}
//                                     className="rounded-full w-16"
//                                 />
//                             ) : (
//                                 <NemuImage
//                                     src={'/profile.png'}
//                                     alt="profile image"
//                                     width={50}
//                                     height={50}
//                                     className="avatar rounded-full w-16"
//                                 />
//                             )
//                         ) : (
//                             <UserIcon className="w-6 h-6" />
//                         )}
//                     </Menu.Button>
//                 </div>
//                 <Transition
//                     as={Fragment}
//                     enter="transition ease-out duration-100"
//                     enterFrom="transform opacity-0 scale-95"
//                     enterTo="transform opacity-100 scale-100"
//                     leave="transition ease-in duration-75"
//                     leaveFrom="transform opacity-100 scale-100"
//                     leaveTo="transform opacity-0 scale-95"
//                 >
//                     <Menu.Items className="absolute z-10 right-0 mt-2 w-56 origin-top-right divide-y divide-gray-100 rounded-md bg-base-300 shadow-lg">
//                         <div className="px-1 py-1 ">
//                             {navbar_items.map((item: UserInfoLink) => (
//                                 <Menu.Item key={item.title}>
//                                     {({ active }) => (
//                                         <Link
//                                             href={item.path}
//                                             className={ClassNames(
//                                                 active
//                                                     ? 'bg-base-100 text-base-content'
//                                                     : 'bg-base-300 text-base-content',
//                                                 'flex justify-start items-center gap-5 w-full px-5 py-2 text-sm'
//                                             )}
//                                         >
//                                             {ConvertUserIconEnumToReactDOM(item.icon)}
//                                             {item.title}
//                                         </Link>
//                                     )}
//                                 </Menu.Item>
//                             ))}
//                             <Menu.Item>
//                                 {({ active }) => <ThemeSwitcher active={active} />}
//                             </Menu.Item>
//                         </div>
//                     </Menu.Items>
//                 </Transition>
//             </Menu>
//         </div>
//     )
// }
