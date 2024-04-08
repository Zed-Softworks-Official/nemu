import { cn } from '@/lib/utils'

export default function Modal({
    showModal,
    setShowModal,
    classNames,
    children
}: {
    showModal: boolean
    setShowModal: (value: boolean) => void
    classNames?: string
    children: React.ReactNode
}) {
    return (
        <dialog className="modal overflow-hidden" open={showModal}>
            <div
                className={cn(
                    'modal-box max-w-6xl space-y-3 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-base-300',
                    classNames
                )}
            >
                {children}
            </div>
            <form
                method="dialog"
                onClick={() => setShowModal(false)}
                className="modal-backdrop bg-[#0006]"
            >
                <button>close</button>
            </form>
        </dialog>
    )
}
