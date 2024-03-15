import React from 'react'

import Logo from '@/components/navigation/standard/logo'
import Search from '@/components/navigation/standard/search/search'
import UserInfoMenu from '@/components/navigation/user/user-info-menu'
import Notifications from '../notifications'

export default function Navbar() {
    return (
        <div className="py-8 flex items-center justify-between container mx-auto gap-10">
            <Logo />
            <Search />
            <Notifications />
            <UserInfoMenu />
        </div>
    )
}
