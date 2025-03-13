// Example model schema from the Drizzle docs
// https://orm.drizzle.team/docs/sql-schema-declaration

import { type JSONContent } from '@tiptap/react'

import { relations, sql } from 'drizzle-orm'
import {
    decimal,
    text,
    boolean,
    index,
    mysqlTableCreator,
    timestamp,
    varchar,
    json,
    int,
    mysqlEnum
} from 'drizzle-orm/mysql-core'
import { type FormElementInstance } from '~/components/form-builder/elements/form-elements'

import {
    type SocialAccount,
    type InvoiceStatus,
    type InvoiceItem,
    type ChargeMethod,
    userRoles,
    invoiceStatuses,
    chargeMethods,
    requestStatuses,
    downloadTypes,
    type DownloadType,
    type RequestStatus,
    commissionAvalabilities,
    type CommissionAvailability,
    conStatus,
    type ConStatus,
    purchaseStatus,
    type PurchaseStatus,
    type DownloadData
} from '~/lib/types'

/**
 * This is an example of how to use the multi-project schema feature of Drizzle ORM. Use the same
 * database instance for multiple projects.
 *
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const createTable = mysqlTableCreator((name) => `nemu_${name}`)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const convertEnum = (m_Enum: any) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    Object.values(m_Enum).map((value: any) => `${value}`) as [string, ...string[]]

/**
 * Creates a MySQL enum for user roles
 * @param {string} name - The name of the enum column
 * @returns {import('drizzle-orm/mysql-core').MySqlEnum} MySQL enum for user roles
 */
export const UserRoleEnum = (name: string) => mysqlEnum(name, userRoles)

/**
 * Creates a MySQL enum for invoice statuses
 * @param {string} name - The name of the enum column
 * @returns {import('drizzle-orm/mysql-core').MySqlEnum} MySQL enum for invoice statuses
 */
export const InvoiceStatusEnum = (name: string) =>
    mysqlEnum(name, convertEnum(invoiceStatuses))

/**
 * Creates a MySQL enum for request statuses
 * @param {string} name - The name of the enum column
 * @returns {import('drizzle-orm/mysql-core').MySqlEnum} MySQL enum for request statuses
 */
export const RequestStatusEnum = (name: string) =>
    mysqlEnum(name, convertEnum(requestStatuses))

/**
 * Creates a MySQL enum for commission availability states
 * @param {string} name - The name of the enum column
 * @returns {import('drizzle-orm/mysql-core').MySqlEnum} MySQL enum for commission availability
 */
export const CommissionAvailabilityEnum = (name: string) =>
    mysqlEnum(name, convertEnum(commissionAvalabilities))

/**
 * Creates a MySQL enum for download types
 * @param {string} name - The name of the enum column
 * @returns {import('drizzle-orm/mysql-core').MySqlEnum} MySQL enum for download types
 */
export const DownloadTypeEnum = (name: string) =>
    mysqlEnum(name, convertEnum(downloadTypes))

/**
 * Creates a MySQL enum for charge methods
 * @param {string} name - The name of the enum column
 * @returns {import('drizzle-orm/mysql-core').MySqlEnum} MySQL enum for charge methods
 */
export const ChargeMethodEnum = (name: string) =>
    mysqlEnum(name, convertEnum(chargeMethods))

/**
 * Creates a MySQL enum for convention statuses
 * @param {string} name - The name of the enum column
 * @returns {import('drizzle-orm/mysql-core').MySqlEnum} MySQL enum for convention statuses
 */
export const ConStatusEnum = (name: string) => mysqlEnum(name, convertEnum(conStatus))

/**
 * Creates a MySQL enum for purchase statuses
 * @param {string} name - The name of the enum column
 * @returns {import('drizzle-orm/mysql-core').MySqlEnum} MySQL enum for purchase statuses
 */
export const PurchaseStatusEnum = (name: string) =>
    mysqlEnum(name, convertEnum(purchaseStatus))

//////////////////////////////////////////////////////////
// Tables
//////////////////////////////////////////////////////////

/**
 * Delivery table
 *
 * Stores digital deliveries for users, including both purchased products and commissioned works.
 * Each delivery is associated with a user, artist, and optionally a request.
 *
 * @property {string} id - Unique identifier for the delivery
 * @property {string} userId - ID of the user receiving the delivery
 * @property {string} artistId - ID of the artist who created the content
 * @property {string} requestId - Optional ID of the associated commission request
 * @property {string} utKey - Unique transfer key for the delivery
 * @property {DownloadType} type - Type of download (e.g., image, video)
 * @property {Date} createdAt - When the delivery was created
 * @property {Date} updatedAt - When the delivery was last updated
 * @property {number} version - Version number of the delivery, increments on update
 * @property {boolean} isFinal - Whether this is the final delivery for a commission
 */
export const delivery = createTable('delivery', {
    id: varchar('id', { length: 128 }).primaryKey(),

    userId: text('user_id').notNull(),
    artistId: text('artist_id').notNull(),

    requestId: text('request_id'),

    utKey: text('ut_key').notNull(),
    type: DownloadTypeEnum('download_type').$type<DownloadType>().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
        .$onUpdate(() => new Date())
        .defaultNow()
        .notNull(),
    version: int('version')
        .default(1)
        .$onUpdate(() => sql`version + 1`)
        .notNull(),

    isFinal: boolean('is_final').default(false).notNull()
})

/**
 * Artists table
 *
 * Stores comprehensive information about artists on the platform, including
 * their profile details, payment settings, and customization options.
 *
 * @property {string} id - Unique identifier for the artist
 * @property {string} userId - ID of the user account associated with this artist
 * @property {string} stripeAccount - Stripe account ID for payments
 * @property {boolean} onboarded - Whether the artist has completed onboarding
 * @property {Date} createdAt - When the artist profile was created
 * @property {string} handle - Unique username/handle for the artist
 * @property {string} about - Artist's bio/description
 * @property {string} location - Artist's location
 * @property {string} terms - Artist's terms of service
 * @property {string} tipJarUrl - Optional URL for the artist's tip jar
 * @property {string} headerPhoto - Key for the artist's header photo
 * @property {boolean} automatedMessageEnabled - Whether automated messages are enabled
 * @property {string} automatedMessage - Content of the automated message
 * @property {ChargeMethod} defaultChargeMethod - Default payment method for commissions
 * @property {SocialAccount[]} socials - Array of social media accounts
 */
export const artists = createTable('artist', {
    id: varchar('id', { length: 128 }).primaryKey(),
    userId: text('user_id').notNull(),
    stripeAccount: text('stripe_account').notNull(),
    onboarded: boolean('onboarded').default(false).notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),

    handle: varchar('handle', { length: 255 }).notNull().unique(),
    about: text('about').default('Peko Peko').notNull(),
    location: varchar('location', { length: 256 }).notNull(),
    terms: text('terms').default('Pls Feed Nemu').notNull(),
    tipJarUrl: text('tip_jar_url'),
    headerPhoto: text('header_photo')
        .default('DLbLjqbVNirZvpnl7EHDBYPmtFe4irSybTpJxdUn89oQzflX')
        .notNull(),

    automatedMessageEnabled: boolean('automated_message_enabled').default(false),
    automatedMessage: text('automated_message'),

    defaultChargeMethod: ChargeMethodEnum('default_charge_method')
        .$type<ChargeMethod>()
        .default('in_full')
        .notNull(),

    socials: json('socials').$type<SocialAccount[]>().notNull()
})

/**
 * Artist Codes table
 *
 * Stores invitation codes that allow users to register as artists.
 * Each code has an expiration date and can only be used once.
 *
 * @property {string} id - Unique identifier for the code entry
 * @property {string} code - The actual invitation code
 * @property {Date} createdAt - When the code was created
 * @property {Date} expiresAt - When the code expires
 */
export const artistCodes = createTable('artist_code', {
    id: varchar('id', { length: 128 }).primaryKey(),
    code: varchar('code', { length: 128 }).notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at')
})

/**
 * Artist Verifications table
 *
 * Stores verification information submitted by users applying to become artists.
 * This includes their requested handle and various platform links for verification.
 *
 * @property {string} id - Unique identifier for the verification request
 * @property {string} userId - ID of the user requesting verification
 * @property {string} requestedHandle - Desired artist handle (must be unique)
 * @property {string} location - Artist's location
 * @property {string} twitter - Optional Twitter/X profile link
 * @property {string} pixiv - Optional Pixiv profile link
 * @property {string} website - Optional personal website link
 * @property {Date} createdAt - When the verification request was submitted
 */
export const artistVerifications = createTable(
    'artist_verification',
    {
        id: varchar('id', { length: 128 }).primaryKey(),
        userId: varchar('user_id', { length: 256 }).notNull(),

        requestedHandle: varchar('requested_handle', { length: 128 }).notNull().unique(),
        location: varchar('location', { length: 256 }).notNull(),
        twitter: text('twitter'),
        pixiv: text('pixiv'),
        website: text('website'),

        createdAt: timestamp('created_at').defaultNow().notNull()
    },
    (artistVerification) => ({
        userIndex: index('user_idx').on(artistVerification.userId)
    })
)

/**
 * Portfolios table
 *
 * Stores portfolio items for artists to showcase their work.
 * Each portfolio item can be linked to a commission request.
 *
 * @property {string} id - Unique identifier for the portfolio item
 * @property {string} artistId - ID of the artist who owns this portfolio item
 * @property {string} utKey - Unique transfer key for the portfolio image
 * @property {string} title - Title of the portfolio item
 * @property {boolean} adultContent - Whether the item contains adult content
 * @property {Date} createdAt - When the portfolio item was created
 * @property {string} requestId - Optional ID of the commission request this was created from
 */
export const portfolios = createTable('portfolio', {
    id: varchar('id', { length: 128 }).primaryKey(),
    artistId: text('artist_id').notNull(),

    utKey: text('ut_key').notNull(),
    title: varchar('title', { length: 256 }).notNull(),
    adultContent: boolean('adult_content').default(false).notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    requestId: text('request_id')
})

/**
 * Commissions table
 *
 * Stores detailed information about commission offerings from artists.
 * Includes pricing, availability, description, and configuration options.
 *
 * @property {string} id - Unique identifier for the commission
 * @property {string} artistId - ID of the artist offering this commission
 * @property {number} price - Base price of the commission in cents
 * @property {number} rating - Popularity rating score
 * @property {boolean} adultContent - Whether the commission allows adult content
 * @property {string} formId - ID of the form used for commission requests
 * @property {string} title - Title of the commission offering
 * @property {JSONContent} description - Rich text description of the commission
 * @property {Array<{utKey: string, blurData?: string}>} images - Example images for the commission
 * @property {CommissionAvailability} availability - Current availability status
 * @property {string} slug - URL-friendly identifier
 * @property {boolean} published - Whether the commission is publicly visible
 * @property {Date} createdAt - When the commission was created
 * @property {number} maxCommissionsUntilWaitlist - Threshold for switching to waitlist
 * @property {number} maxCommissionsUntilClosed - Threshold for closing commissions
 * @property {number} totalRequests - Total number of requests received
 * @property {number} newRequests - Number of new/pending requests
 * @property {number} acceptedRequests - Number of accepted requests
 * @property {number} rejectedRequests - Number of rejected requests
 * @property {ChargeMethod} chargeMethod - Payment method (in_full, split, etc.)
 * @property {number} downpaymentPercentage - Percentage required for downpayment
 * @property {boolean} rushOrdersAllowed - Whether rush orders are accepted
 * @property {number} rushCharge - Additional charge for rush orders
 * @property {boolean} rushPercentage - Whether rush charge is a percentage
 */
export const commissions = createTable('commission', {
    id: varchar('id', { length: 128 }).primaryKey(),
    artistId: text('artist_id').notNull(),
    price: int('price').notNull(),
    rating: int('rating').default(500),
    adultContent: boolean('adult_content').default(false).notNull(),

    formId: text('form_id').notNull(),

    title: text('title').notNull(),
    description: json('description').$type<JSONContent>().notNull(),
    images: json('images')
        .$type<
            {
                utKey: string
                blurData?: string
            }[]
        >()
        .notNull(),
    availability: CommissionAvailabilityEnum('availability')
        .$type<CommissionAvailability>()
        .notNull(),
    slug: text('slug').notNull(),

    published: boolean('published').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),

    maxCommissionsUntilWaitlist: int('max_commissions_until_waitlist')
        .default(0)
        .notNull(),
    maxCommissionsUntilClosed: int('max_commissions_until_closed').default(0).notNull(),

    totalRequests: int('total_requests').default(0).notNull(),
    newRequests: int('new_requests').default(0).notNull(),
    acceptedRequests: int('accepted_requests').default(0).notNull(),
    rejectedRequests: int('rejected_requests').default(0).notNull(),

    chargeMethod: ChargeMethodEnum('charge_method')
        .$type<ChargeMethod>()
        .default('in_full')
        .notNull(),
    downpaymentPercentage: int('downpayment_percentage').default(0).notNull(),

    rushOrdersAllowed: boolean('rush_orders_allowed').default(false),
    rushCharge: decimal('rush_charge', { precision: 3, scale: 2 }).default('0.00'),
    rushPercentage: boolean('rush_percentage').default(false)
})

/**
 * Products table
 *
 * Stores digital products that artists can sell directly without commission process.
 *
 * @property {string} id - Unique identifier for the product
 * @property {string} title - Product title
 * @property {JSONContent} description - Rich text description of the product
 * @property {boolean} published - Whether the product is publicly available
 * @property {boolean} isFree - Whether the product is free
 * @property {Date} createdAt - When the product was created
 * @property {number} price - Price of the product in cents
 * @property {string[]} images - Array of image keys for product display
 * @property {DownloadData} download - Download information for the product
 * @property {string} artistId - ID of the artist selling this product
 */
export const products = createTable('products', {
    id: varchar('id', { length: 128 }).primaryKey(),
    title: varchar('title', { length: 128 }).notNull(),
    description: json('description').$type<JSONContent>(),
    published: boolean('published').default(false).notNull(),
    isFree: boolean('is_free').default(false).notNull(),

    createdAt: timestamp('created_at').defaultNow(),

    price: int('price').notNull(),
    images: json('images').$type<string[]>().notNull(),
    download: json('download').$type<DownloadData>().notNull(),

    artistId: varchar('artist_id', { length: 128 }).notNull()
})

/**
 * Purchases table
 *
 * Tracks user purchases of products from artists.
 *
 * @property {string} id - Unique identifier for the purchase
 * @property {string} productId - ID of the purchased product
 * @property {string} userId - ID of the user making the purchase
 * @property {string} artistId - ID of the artist who created the product
 * @property {PurchaseStatus} status - Current status of the purchase
 * @property {Date} createdAt - When the purchase was created
 */
export const purchase = createTable('purchase', {
    id: varchar('id', { length: 128 }).primaryKey(),

    productId: varchar('product_id', { length: 128 }).notNull(),
    userId: varchar('user_id', { length: 128 }).notNull(),
    artistId: varchar('artist_id', { length: 128 }).notNull(),
    status: PurchaseStatusEnum('status')
        .$type<PurchaseStatus>()
        .default('pending')
        .notNull(),

    createdAt: timestamp('created_at').defaultNow()
})

/**
 * Invoices table
 *
 * Stores invoice information for commission payments.
 * Links to Stripe for payment processing.
 *
 * @property {string} id - Unique identifier for the invoice
 * @property {boolean} sent - Whether the invoice has been sent to the customer
 * @property {InvoiceStatus} status - Current status of the invoice
 * @property {boolean} isFinal - Whether this is the final invoice for a commission
 * @property {string} stripeId - Stripe invoice ID
 * @property {string} hostedUrl - URL to the hosted invoice page
 * @property {InvoiceItem[]} items - Line items included in the invoice
 * @property {Date} createdAt - When the invoice was created
 * @property {string} customerId - Stripe customer ID
 * @property {string} stripeAccount - Stripe connected account ID
 * @property {number} total - Total amount in cents
 * @property {string} userId - ID of the user being invoiced
 * @property {string} artistId - ID of the artist issuing the invoice
 * @property {string} requestId - ID of the associated commission request
 */
export const invoices = createTable('invoice', {
    id: varchar('id', { length: 128 }).primaryKey(),
    sent: boolean('sent').default(false).notNull(),
    status: InvoiceStatusEnum('status').$type<InvoiceStatus>().notNull(),
    isFinal: boolean('is_final').default(false).notNull(),

    stripeId: varchar('stripe_id', { length: 128 }).notNull(),
    hostedUrl: text('hosted_url'),

    items: json('items').$type<InvoiceItem[]>().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),

    customerId: text('customer_id').notNull(),
    stripeAccount: text('stripe_account').notNull(),
    total: int('total').notNull(),

    userId: text('user_id').notNull(),
    artistId: text('artist_id').notNull(),
    requestId: text('request_id').notNull()
})

/**
 * Forms table
 *
 * Stores customizable forms that artists create for commission requests.
 *
 * @property {string} id - Unique identifier for the form
 * @property {string} artistId - ID of the artist who created the form
 * @property {string[]} commissionId - IDs of commissions using this form
 * @property {string} name - Name/title of the form
 * @property {string} description - Description of the form's purpose
 * @property {Date} createdAt - When the form was created
 * @property {FormElementInstance[]} content - Form elements and structure
 */
export const forms = createTable('form', {
    id: varchar('id', { length: 128 }).primaryKey(),
    artistId: text('artist_id').notNull(),
    commissionId: json('commission_id').$type<string[]>(),

    name: text('title').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    content: json('content').$type<FormElementInstance[]>().default([])
})

/**
 * Requests table
 *
 * Stores commission requests submitted by users.
 * Links to forms, commissions, invoices, and other related entities.
 *
 * @property {string} id - Unique identifier for the request
 * @property {string} formId - ID of the form used for this request
 * @property {string} userId - ID of the user who submitted the request
 * @property {Date} createdAt - When the request was submitted
 * @property {RequestStatus} status - Current status of the request
 * @property {string} commissionId - ID of the commission type requested
 * @property {string} orderId - Order identifier for this request
 * @property {string[]} invoiceIds - IDs of invoices associated with this request
 * @property {string} kanbanId - ID of the kanban board for this request
 * @property {string} deliveryId - ID of the delivery for this request
 * @property {Record<string, string>} content - Form submission data
 */
export const requests = createTable('request', {
    id: varchar('id', { length: 128 }).primaryKey(),
    formId: text('form_id').notNull(),
    userId: text('user_id').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),

    status: RequestStatusEnum('status').$type<RequestStatus>().notNull(),
    commissionId: text('commission_id').notNull(),

    orderId: text('order_id').notNull(),
    invoiceIds: json('invoice_ids').$type<string[]>(),
    kanbanId: text('kanban_id'),
    deliveryId: text('delivery_id'),

    content: json('content').$type<Record<string, string>>().notNull()
})

/**
 * Kanbans table
 *
 * Stores kanban board data for tracking commission progress.
 *
 * @property {string} id - Unique identifier for the kanban board
 * @property {string} requestId - ID of the associated commission request
 * @property {any} containers - JSON data for kanban containers/columns
 * @property {any} tasks - JSON data for kanban tasks
 * @property {Date} createdAt - When the kanban board was created
 */
export const kanbans = createTable('kanban', {
    id: varchar('id', { length: 128 }).primaryKey(),
    requestId: text('request_id').notNull(),

    containers: json('containers'),
    tasks: json('tasks'),

    createdAt: timestamp('created_at').defaultNow().notNull()
})

/**
 * Chats table
 *
 * Stores chat information for communication between artists and clients.
 *
 * @property {string} id - Unique identifier for the chat
 * @property {string} requestId - ID of the associated commission request
 * @property {string} commissionId - ID of the associated commission
 * @property {string} artistId - ID of the artist in the chat
 * @property {string[]} userIds - IDs of all users participating in the chat
 * @property {string} messageRedisKey - Redis key for retrieving chat messages
 * @property {Date} createdAt - When the chat was created
 */
export const chats = createTable('chats', {
    id: varchar('id', { length: 128 }).primaryKey(),

    requestId: varchar('request_id', { length: 128 }).notNull(),
    commissionId: varchar('commission_id', { length: 128 }).notNull(),
    artistId: varchar('artist_id', { length: 128 }).notNull(),

    userIds: json('user_ids').$type<string[]>().notNull(),

    messageRedisKey: text('message_redis_key').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull()
})

/**
 * Convention Sign-Up table
 *
 * Stores information about convention sign-ups.
 *
 * @property {string} id - Unique identifier for the convention sign-up
 * @property {string} name - Name of the convention
 * @property {string} slug - URL-friendly identifier
 * @property {ConStatus} status - Current status of the convention
 * @property {Date} createdAt - When the convention entry was created
 * @property {Date} expiresAt - When the sign-up period expires
 * @property {number} signUpCount - Number of users signed up
 */
export const conSignUp = createTable(
    'con_sign_up',
    {
        id: varchar('id', { length: 128 }).primaryKey(),

        name: varchar('title', { length: 128 }).notNull(),
        slug: varchar('slug', { length: 128 }).notNull(),
        status: ConStatusEnum('status').$type<ConStatus>().default('active'),

        createdAt: timestamp('created_at').defaultNow().notNull(),
        expiresAt: timestamp('expires_at').notNull(),
        signUpCount: int('sign_up_count').default(0).notNull()
    },
    (table) => ({
        slugIndex: index('slug_idx').on(table.slug),
        statusIndex: index('status_idx').on(table.status)
    })
)

//////////////////////////////////////////////////////////
// Relations
//////////////////////////////////////////////////////////

/**
 * Chat Relations
 *
 * Defines relationships between chats and related entities.
 */
export const chatRelations = relations(chats, ({ one }) => ({
    commission: one(commissions, {
        fields: [chats.commissionId],
        references: [commissions.id]
    }),
    artist: one(artists, {
        fields: [chats.artistId],
        references: [artists.id]
    }),
    request: one(requests, {
        fields: [chats.requestId],
        references: [requests.id]
    })
}))

/**
 * Delivery Relations
 *
 * Defines relationships between deliveries and related entities.
 */
export const deliveryRelations = relations(delivery, ({ one }) => ({
    artist: one(artists, {
        fields: [delivery.artistId],
        references: [artists.id]
    }),
    request: one(requests, {
        fields: [delivery.requestId],
        references: [requests.id]
    })
}))

/**
 * Artist Relations
 *
 * Defines relationships between artists and related entities.
 */
export const artistRelations = relations(artists, ({ many }) => ({
    commissions: many(commissions),
    portfolio: many(portfolios),
    forms: many(forms),
    invoices: many(invoices),
    chats: many(chats),
    products: many(products)
}))

/**
 * Portfolio Relations
 *
 * Defines relationships between portfolio items and related entities.
 */
export const portfolioRelations = relations(portfolios, ({ one }) => ({
    artist: one(artists, {
        fields: [portfolios.artistId],
        references: [artists.id]
    }),
    request: one(requests, {
        fields: [portfolios.requestId],
        references: [requests.id]
    })
}))

/**
 * Commission Relations
 *
 * Defines relationships between commissions and related entities.
 */
export const commissionRelations = relations(commissions, ({ one, many }) => ({
    artist: one(artists, {
        fields: [commissions.artistId],
        references: [artists.id]
    }),
    form: one(forms, {
        fields: [commissions.formId],
        references: [forms.id]
    }),
    requests: many(requests),
    chats: many(chats)
}))

/**
 * Invoice Relations
 *
 * Defines relationships between invoices and related entities.
 */
export const invoiceRelations = relations(invoices, ({ one }) => ({
    artist: one(artists, {
        fields: [invoices.artistId],
        references: [artists.id]
    }),
    request: one(requests, {
        fields: [invoices.requestId],
        references: [requests.id]
    })
}))

/**
 * Form Relations
 *
 * Defines relationships between forms and related entities.
 */
export const formRelations = relations(forms, ({ one, many }) => ({
    artist: one(artists, {
        fields: [forms.artistId],
        references: [artists.id]
    }),
    commissions: many(commissions),
    requests: many(requests)
}))

/**
 * Request Relations
 *
 * Defines relationships between requests and related entities.
 */
export const requestRelations = relations(requests, ({ one, many }) => ({
    form: one(forms, {
        fields: [requests.formId],
        references: [forms.id]
    }),
    commission: one(commissions, {
        fields: [requests.commissionId],
        references: [commissions.id]
    }),
    invoices: many(invoices),
    kanban: one(kanbans, {
        fields: [requests.kanbanId],
        references: [kanbans.id]
    }),
    delivery: one(delivery, {
        fields: [requests.id],
        references: [delivery.requestId]
    }),
    chat: one(chats, {
        fields: [requests.id],
        references: [chats.requestId]
    })
}))

/**
 * Kanban Relations
 *
 * Defines relationships between kanban boards and related entities.
 */
export const kanbanRelations = relations(kanbans, ({ one }) => ({
    request: one(requests, {
        fields: [kanbans.requestId],
        references: [requests.id]
    })
}))

/**
 * Product Relations
 *
 * Defines relationships between products and related entities.
 */
export const productRelations = relations(products, ({ one, many }) => ({
    artist: one(artists, {
        fields: [products.artistId],
        references: [artists.id]
    }),
    purchases: many(purchase)
}))

/**
 * Purchase Relations
 *
 * Defines relationships between purchases and related entities.
 */
export const purchaseRelations = relations(purchase, ({ one }) => ({
    product: one(products, {
        fields: [purchase.productId],
        references: [products.id]
    }),
    artist: one(artists, {
        fields: [purchase.artistId],
        references: [artists.id]
    })
}))
