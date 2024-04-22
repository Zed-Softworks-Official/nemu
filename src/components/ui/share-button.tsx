'use client'

import { Share2Icon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { usePathname } from 'next/navigation'
import { Button } from '~/components/ui/button'
import { env } from '~/env'
import { nemu_toast } from '~/lib/utils'

export default function ShareButton() {
    const pathname = usePathname()
    const { resolvedTheme } = useTheme()

    return (
        <Button
            variant={'outline'}
            onClick={() => {
                navigator.clipboard.writeText('http://localhost:3000' + pathname)
                nemu_toast('Copied to clipboard', { theme: resolvedTheme, type: 'info' })
            }}
        >
            <Share2Icon className="w-6 h-6" />
            Share
        </Button>
    )
}
