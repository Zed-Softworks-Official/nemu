'use client'

import { ClientSafeProvider, signIn } from 'next-auth/react'
import { Button } from '~/components/ui/button'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
    faDiscord,
    faDocker,
    faGoogle,
    faXTwitter
} from '@fortawesome/free-brands-svg-icons'

function getIcon(provider_name: string) {
    switch (provider_name) {
        case 'Google':
            return faGoogle
        case 'Discord':
            return faDiscord
        case 'Twitter':
            return faXTwitter
    }

    return faDocker
}

export default function OAuthProvider({ provider }: { provider: ClientSafeProvider }) {
    return (
        <Button variant={'dark'} onClick={() => signIn(provider.id)}>
            <FontAwesomeIcon icon={getIcon(provider.name)} className="w-5 h-5" />
            {provider.name}
        </Button>
    )
}
