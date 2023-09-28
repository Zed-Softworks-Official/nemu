import React  from "react";

import { getSession } from '@auth0/nextjs-auth0'

import UserInfoMenu from "./UserInfoMenu";
import { PrismaClient } from "@prisma/client";

export default async function UserInfo() {
    const session = await getSession();

    let prisma = new PrismaClient();
    let artist_info = await prisma.artist.findFirst({
        where: {
            auth0id: session?.user?.sub
        }
    });

    prisma.$disconnect();

    return (
        <UserInfoMenu session={session ? true : false} artist={artist_info ? true : false} artist_handle={artist_info?.handle} />
    )
}
