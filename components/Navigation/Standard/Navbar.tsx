import React from "react";

import Logo from '@/components/Navigation/Standard/Logo'
import Search from '@/components/Navigation/Standard/Search'
import UserInfo from '@/components/Navigation/User/UserInfo'

export default function Navbar() {
    return (
        <div className='py-8 flex items-center container mx-auto'>
            <Logo />
            <Search />
            <UserInfo />
        </div>
    )
}