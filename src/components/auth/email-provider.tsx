'use client'

import { signIn } from 'next-auth/react'
import { useState } from 'react'

export default function EmailProvider() {
    const [email, setEmail] = useState('')

    return (
        <div>
            <input
                name="email"
                id="email"
                type="email"
                placeholder="Email"
                className="input w-full"
                onChange={(e) => setEmail(e.currentTarget.value)}
            />
            <button
                className="btn btn-primary w-full"
                onClick={() => signIn('email', { email })}
            >
                {/* <FontAwesomeIcon icon={faEnvelope} className="w-5 h-5" /> */}
                Sign In
            </button>
        </div>
    )
}
