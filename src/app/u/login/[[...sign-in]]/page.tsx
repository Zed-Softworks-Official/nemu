import { SignIn } from '@clerk/nextjs'

export default function LoginPage() {
    return <SignIn path="/u/login" signUpUrl="/u/signup" />
}
