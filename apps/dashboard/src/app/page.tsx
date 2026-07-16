import { currentUser } from '@clerk/nextjs/server'

export default async function HomePage() {
    const user = await currentUser()

    return (
        <div>
            <h1>Dashboard</h1>
            <p>Welcome, {user?.fullName}</p>
        </div>
    )
}
