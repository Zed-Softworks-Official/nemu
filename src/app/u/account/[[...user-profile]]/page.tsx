import { UserProfile } from '@clerk/nextjs'

export default function UserProfilePage() {
    return <UserProfile path="/u/account" />
}