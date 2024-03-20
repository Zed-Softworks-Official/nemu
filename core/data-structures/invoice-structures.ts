export interface InoviceCreateInputType {
    customer_id?: string
    user_id: string
    artist_id?: string
    stripe_account?: string

    initial_item_name?: string
    initial_item_price?: number
    initial_item_quantity?: number

    form_submission_id: string
}

export interface InvoiceItemInputType {
    id?: string
    name?: string
    price?: number
    quantity?: number
}