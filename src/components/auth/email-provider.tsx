'use client'

import { MailIcon } from 'lucide-react'
import { signIn } from 'next-auth/react'
import { useState } from 'react'

import { Input } from '~/components/ui/input'
import { Button } from '~/components/ui/button'

export default function EmailProvider() {
    const [email, setEmail] = useState('')

    return (
        <div className="flex flex-col gap-5">
            <Input
                type="email"
                placeholder="Email"
                onChange={(e) => setEmail(e.currentTarget.value)}
            />
            <Button onClick={() => signIn('email', { email })}>
                <MailIcon className="w-6 h-6" />
                Sign In
            </Button>
        </div>
    )
}
