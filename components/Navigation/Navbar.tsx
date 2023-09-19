import React from "react";

import Logo from './Logo'
import Search from './Search'
import UserInfo from './User/UserInfo'

export default function Navbar() {
    return (
        <div className='py-8 flex items-center container mx-auto'>
            <Logo />
            <Search />
            <UserInfo />
        </div>
    )
}