'use client'

import Modal from '@/components/modal'
import CreateInvoiceForm from './create-invoice-form'
import { useState } from 'react'
import { GraphQLFetcher } from '@/core/helpers'
import { NemuResponse, StatusCode } from '@/core/responses'
import { toast } from 'react-toastify'
import { Invoice, InvoiceItem } from '@prisma/client'

export default function CommissionInvoicing({
    submission_id,
    customer_id,
    stripe_account,
    invoice,
    invoice_items
}: {
    submission_id: string
    customer_id: string
    stripe_account: string
    invoice: Invoice
    invoice_items: InvoiceItem[]
}) {
    const [showModal, setShowModal] = useState(false)
    const [sent, setSent] = useState(false)

    return (
        <>
            <div className="flex gap-5 w-full">
                <button type="button" className="btn btn-primary" onClick={() => setShowModal(true)} disabled={showModal}>
                    Edit Invoice
                </button>
                <button
                    type="button"
                    className="btn btn-success"
                    onClick={async () => {
                        setSent(true)
                        const toast_id = toast.loading('Sending Invoice!', { theme: 'dark' })

                        const response = await GraphQLFetcher<{ send_invoice: NemuResponse }>(
                            `mutation {
                                send_invoice(invoice_id: "${invoice.id}") {
                                    status
                                    message
                                }
                            }`
                        )

                        if (response.send_invoice.status == StatusCode.Success) {
                            toast.update(toast_id, {
                                render: 'Invoice Sent',
                                type: 'success',
                                autoClose: 5000,
                                isLoading: false
                            })
                        } else {
                            toast.update(toast_id, {
                                render: response.send_invoice.message,
                                type: 'error',
                                autoClose: 5000,
                                isLoading: false
                            })
                        }
                    }}
                    disabled={invoice.sent || sent}
                >
                    Send Invoice
                </button>
            </div>
            <Modal showModal={showModal} setShowModal={setShowModal}>
                <CreateInvoiceForm invoice_id={invoice.id} invoice_items={invoice_items} />
            </Modal>
        </>
    )
}
