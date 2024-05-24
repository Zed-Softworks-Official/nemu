'use client'

import { useRouter } from 'next/navigation'
import { ElementRef, useEffect, useRef } from 'react'

export default function ParallelModal({ children }: { children: React.ReactNode }) {
    const router = useRouter()
    const dialogRef = useRef<ElementRef<'dialog'>>(null)

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
    }, [])

    function onDismiss() {
        router.back()
    }

    return (
        <dialog ref={dialogRef} className="modal" onClose={onDismiss} open>
            <div className="modal-box bg-base-300 max-w-6xl w-full animate-pop-in transition-all duration-200 ease-in-out">
                {children}
            </div>
            <div className="modal-backdrop bg-black/80" onMouseDown={onDismiss}></div>
        </dialog>
    )
}
