import React from "react";

import Logo from './Logo'
import Search from './Search'
import UserInfo from './UserInfo'

export default function Navbar() {
    return (
        <div className='py-8 flex items-center'>
            <Logo />
            <Search />
            <UserInfo />
        </div>
    )
}