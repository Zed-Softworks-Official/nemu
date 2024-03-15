export interface CommissionInputType {
    artist_id?: string
    title?: string
    description?: string
    availability?: number
    featured_image?: string
    additional_images?: string[]
    rush_orders_allowed?: boolean
    rush_charge?: number
    rush_percentage?: boolean
    form_id?: string
    price?: number
    use_invoicing?: boolean
    max_commission_until_waitlist?: number
    max_commission_until_closed?: number
    published?: boolean
}
