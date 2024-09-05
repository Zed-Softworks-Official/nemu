'use client'

import { UserProfile } from '@clerk/nextjs'

export default function NemuUserProfile() {
    return <UserProfile path="/u/account" />
}
