'use client'

import { Share2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '~/components/ui/button'

export default function ShareButton() {
    return (
        <Button
            variant={'outline'}
            onMouseDown={async () => {
                await navigator.clipboard.writeText(window.location.href)
                toast.info('Copied to clipboard')
            }}
        >
            <Share2Icon className="h-6 w-6" />
            Share
        </Button>
    )
}
