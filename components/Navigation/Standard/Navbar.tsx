import React from 'react'

import Logo from '@/components/navigation/standard/logo'
import Search from '@/components/navigation/standard/search/search'
import UserInfoMenu from '@/components/navigation/user/user-info-menu'

export default function Navbar() {
    return (
        <div className="py-8 flex items-center container mx-auto">
            <Logo />
            <Search />
            <UserInfoMenu />
        </div>
    )
}
