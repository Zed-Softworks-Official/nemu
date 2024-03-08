'use client'

export default function MessagesModal({
    showModal,
    closeFunction,
    children
}: {
    showModal: boolean
    closeFunction: () => void
    children: React.ReactNode
}) {
    return (
        <dialog className="modal overflow-hidden" open={showModal}>
            <div className="modal-box space-y-3 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-base-300">
                {children}
            </div>
            <form
                method="dialog"
                onClick={closeFunction}
                className="modal-backdrop bg-[#0006]"
            >
                <button>close</button>
            </form>
        </dialog>
    )
}
