'use client'

import { Share2Icon } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '~/components/ui/button'

export default function ShareButton() {
    const pathname = usePathname()

    return (
        <Button
            variant={'outline'}
            onMouseDown={async () => {
                await navigator.clipboard.writeText('http://localhost:3000' + pathname)
                toast.info('Copied to clipboard')
            }}
        >
            <Share2Icon className="h-6 w-6" />
            Share
        </Button>
    )
}
