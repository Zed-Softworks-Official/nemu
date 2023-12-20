export default function Modal({
    showModal,
    setShowModal,
    children
}: {
    showModal: boolean
    setShowModal: (value: boolean) => void
    children: React.ReactNode
}) {
    return (
        <dialog className="modal" open={showModal}>
            <div className="modal-box space-y-3">{children}</div>
            <form
                method="dialog"
                onClick={() => setShowModal(false)}
                className="modal-backdrop bg-fullblack/90"
            >
                <button>close</button>
            </form>
        </dialog>
    )
}
