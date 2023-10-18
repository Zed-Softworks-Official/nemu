'use client'

import { usePathname } from "next/navigation"

const errors = {
    Signin: 'Try singing in with a different account.',
    OAuthSignin: 'Try signing in with a different account',
    OAuthCallback: 'Try sigining in with a different account',
    OAuthCreateAccount: 'Account Couldn\'t be created.',
    EmailCreateAccount: 'Account Couldn\'t be created.',
    OAuthAccountNotLinked: 'To confirm your identity, sign in with the same account you used originally.',
    EmailSignin: 'Check your email address',
    default: 'Unable to Sign in'
}

export default function AuthError() {
    //const pathname = usePathname()
    

    //const errorMessage = error && (errors[error] ?? errors.default)
    return (
        <div>
            
        </div>
    )
}