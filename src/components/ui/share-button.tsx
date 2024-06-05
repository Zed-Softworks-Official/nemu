'use client'

import { Share2Icon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { usePathname } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '~/components/ui/button'
import { env } from '~/env'

export default function ShareButton() {
    const pathname = usePathname()

    return (
        <Button
            variant={'outline'}
            onMouseDown={() => {
                navigator.clipboard.writeText('http://localhost:3000' + pathname)
                toast('Copied to clipboard' )
            }}
        >
            <Share2Icon className="w-6 h-6" />
            Share
        </Button>
    )
}
