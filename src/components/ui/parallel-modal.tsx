'use client'

import { useRouter } from 'next/navigation'
import { type ElementRef, useCallback, useEffect, useRef } from 'react'

export default function ParallelModal({ children }: { children: React.ReactNode }) {
    const router = useRouter()
    const dialogRef = useRef<ElementRef<'dialog'>>(null)

    const onDismiss = useCallback(() => {
        router.back()
    }, [router])

    useEffect(() => {
        // If the modal isn't open, then open it
        if (!dialogRef.current?.open) {
            dialogRef.current?.showModal()
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
        <dialog ref={dialogRef} className="modal" onClose={onDismiss} open>
            <div className="modal-box w-full max-w-6xl animate-pop-in bg-base-300 transition-all duration-200 ease-in-out">
                {children}
            </div>
            <div className="modal-backdrop bg-black/80" onMouseDown={onDismiss}></div>
        </dialog>
    )
}
