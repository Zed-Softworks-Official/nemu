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
    invoice: Invoice,
    invoice_items: InvoiceItem[]
}) {
    const [showModal, setShowModal] = useState(false)

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
                        // const response = await GraphQLFetcher<{ finalize_invoice: NemuResponse }>(
                        //     `mutation {
                        //         finalize_invoice(submission_id: "${submission_id}", stripe_acccount: "${stripe_account}") {
                        //             status
                        //             message
                        //         }
                        //     }`
                        // )
                        // if (response.finalize_invoice.status != StatusCode.Success) {
                        //     toast(response.finalize_invoice.message, { theme: 'dark', type: 'error' })
                        // } else {
                        //     toast('Invoice Sent', { theme: 'dark', type: 'success' })
                        // }
                    }}
                    disabled={invoice.sent}
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
