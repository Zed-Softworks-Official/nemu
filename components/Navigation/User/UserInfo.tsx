import React  from "react";

import { getServerSession } from 'next-auth'

import UserInfoMenu from "./UserInfoMenu";

export default async function UserInfo() {
    const session = await getServerSession();

    return (
        <UserInfoMenu session={session ? true : false} artist={false} artist_handle={''} />
    )
}
