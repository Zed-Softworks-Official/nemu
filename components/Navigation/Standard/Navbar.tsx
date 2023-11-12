import React from 'react'

import Logo from '@/components/Navigation/standard/logo'
import Search from '@/components/Navigation/standard/search'
import UserInfoMenu from '@/components/Navigation/user/user-info-menu'

export default function Navbar() {
    return (
        <div className="py-8 flex items-center container mx-auto">
            <Logo />
            <Search />
            <UserInfoMenu />
        </div>
    )
}
