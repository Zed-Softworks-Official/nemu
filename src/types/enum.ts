/**
 * The different states a commission can be in.
 *
 * Closed - Not accepting any commissions
 * Waitlist - Accepting waitlist entries only
 * Open - Actively accepting new commissions
 */
export enum CommissionAvailability {
    Closed = 'closed',
    Waitlist = 'waitlist',
    Open = 'open'
}

/**
 * The different states an invoice can be in.
 *
 * Creating - Invoice is being generated
 * Pending - Waiting for payment
 * Paid - Payment received
 * Cancelled - Invoice cancelled
 */
export enum InvoiceStatus {
    Creating = 'creating',
    Pending = 'pending',
    Paid = 'paid',
    Cancelled = 'cancelled'
}

/**
 * The different states a commission request can be in.
 *
 * Pending - Request is awaiting artist review
 * Accepted - Artist has accepted the commission
 * Rejected - Artist has declined the commission
 * Delivered - Commission work has been completed and delivered
 * Waitlist - Request has been placed on waitlist
 */
export enum RequestStatus {
    Pending = 'pending',
    Accepted = 'accepted',
    Rejected = 'rejected',
    Delivered = 'delivered',
    Waitlist = 'waitlist'
}

/**
 * The different roles a user can have in the system.
 *
 * Standard - Regular user/customer
 * Artist - Creator who can accept commissions
 * Admin - Administrator with full system privileges
 */
export enum UserRole {
    Standard = 'standard',
    Artist = 'artist',
    Admin = 'admin'
}

/**
 * The different social media platforms or websites that can be linked
 * to a user's profile.
 *
 * Twitter - Twitter/X social media profile
 * Pixiv - Pixiv artist profile
 * Website - Personal or portfolio website
 */
export enum SocialAgent {
    Twitter = 'twitter',
    Pixiv = 'pixiv',
    Website = 'website'
}
