import { SignUp } from '@clerk/nextjs'

export default function SignUpPage() {
    return <SignUp path="/u/signup" signInUrl="/u/login" />
}
