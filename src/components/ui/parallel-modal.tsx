'use client'

import { useRouter } from 'next/navigation'
import { type ElementRef, useCallback, useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from './dialog'

export default function ParallelModal(props: { children: React.ReactNode }) {
    const router = useRouter()
    const dialogRef = useRef<ElementRef<'dialog'>>(null)

    const [open, setOpen] = useState(false)
    const onDismiss = useCallback(() => {
        router.back()
    }, [router])

    useEffect(() => {
        // If the modal isn't open, then open it
        if (!dialogRef.current?.open) {
            setOpen(true)
        }

        // Close modal if escape is pressed
        const closeOnEscapePressed = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onDismiss()
            }
        }
        window.addEventListener('keydown', closeOnEscapePressed)
        return () => window.removeEventListener('keydown', closeOnEscapePressed)
    }, [onDismiss])

    return (
        <Dialog
            open={open}
            onOpenChange={() => {
                if (open) {
                    onDismiss()
                }
            }}
        >
            <DialogContent className="w-full max-w-6xl bg-background-tertiary">
                <DialogTitle className="sr-only">Modal</DialogTitle>
                {props.children}
            </DialogContent>
        </Dialog>
    )
}

{
    /* <dialog ref={dialogRef} className="modal" onClose={onDismiss} open>
            <div className="modal-box animate-pop-in w-full max-w-6xl bg-background-tertiary transition-all duration-200 ease-in-out">
                {children}
            </div>
            <div className="modal-backdrop bg-black/80" onMouseDown={onDismiss}></div>
        </dialog> */
}
