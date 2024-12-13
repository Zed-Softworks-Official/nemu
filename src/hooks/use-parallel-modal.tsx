'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useState, useCallback, useEffect, type ElementRef } from 'react'

export function useParallelModal(dialogRef: React.RefObject<ElementRef<'dialog'>>) {
    const router = useRouter()
    const pathname = usePathname()
    const [open, setOpen] = useState(false)

    const onDismiss = useCallback(() => {
        router.back()
    }, [router])

    useEffect(() => {
        // Close modal when navigating to a non-commission page
        if (!pathname.includes('/commission/')) {
            setOpen(false)
            return
        }

        // Open modal when navigating to a commission page
        setOpen(true)
    }, [pathname])

    useEffect(() => {
        if (!dialogRef.current?.open) {
            setOpen(true)
        }

        const closeOnEscapePressed = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onDismiss()
            }
        }
        window.addEventListener('keydown', closeOnEscapePressed)
        return () => window.removeEventListener('keydown', closeOnEscapePressed)
    }, [onDismiss, dialogRef])

    return { open, setOpen, onDismiss }
}
