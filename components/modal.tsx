import { ClassNames } from '@/core/helpers'

export default function Modal({
    showModal,
    setShowModal,
    background,
    children
}: {
    showModal: boolean
    setShowModal: (value: boolean) => void
    background?: string
    children: React.ReactNode
}) {
    return (
        <dialog className="modal overflow-hidden" open={showModal}>
            <div
                className={ClassNames(
                    'modal-box max-w-6xl space-y-3 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-base-300',
                    background && background
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
