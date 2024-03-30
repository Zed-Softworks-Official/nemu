'use client'

import Modal from '@/components/modal'
import CreateInvoiceForm from './create-invoice-form'
import { useState } from 'react'
import { toast } from 'react-toastify'
import { Invoice, InvoiceItem } from '@prisma/client'
import { api } from '@/core/trpc/react'

export default function CommissionInvoicing({
    invoice,
    invoice_items
}: {
    invoice: Invoice
    invoice_items: InvoiceItem[]
}) {
    const [showModal, setShowModal] = useState(false)
    const [sent, setSent] = useState(false)

    const mutation = api.invoices.send_invoice.useMutation()

    return (
        <>
            <div className="flex gap-5 w-full">
                <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setShowModal(true)}
                    disabled={showModal}
                >
                    Edit Invoice
                </button>
                <button
                    type="button"
                    className="btn btn-success"
                    onClick={() => {
                        setSent(true)

                        const toast_id = toast.loading('Sending Invoice!', {
                            theme: 'dark'
                        })

                        mutation.mutateAsync(invoice.id).then((res) => {
                            if (!res.success) {
                                toast.update(toast_id, {
                                    render: 'Invoice Could Not Be Sent',
                                    type: 'error',
                                    autoClose: 5000,
                                    isLoading: false
                                })

                                setSent(false)
                                return
                            }

                            toast.update(toast_id, {
                                render: 'Invoice Sent',
                                type: 'success',
                                autoClose: 5000,
                                isLoading: false
                            })
                        })
                    }}
                    disabled={invoice.sent || sent}
                >
                    Send Invoice
                </button>
            </div>
            <Modal showModal={showModal} setShowModal={setShowModal}>
                <CreateInvoiceForm
                    invoice_id={invoice.id}
                    invoice_items={invoice_items}
                />
            </Modal>
        </>
    )
}
