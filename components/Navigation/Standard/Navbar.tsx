import React from "react";

import Logo from '@/components/Navigation/Standard/Logo'
import Search from '@/components/Navigation/Standard/Search'
import UserInfoMenu from '@/components/Navigation/User/UserInfoMenu'

export default function Navbar() {
    return (
        <div className='py-8 flex items-center container mx-auto'>
            <Logo />
            <Search />
            <UserInfoMenu />
        </div>
    )
}