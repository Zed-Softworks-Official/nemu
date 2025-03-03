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
 * An Enumeration for the user roles
 */
export const UserRoleEnum = (name: string) => mysqlEnum(name, userRoles)

/**
 * Enumeration for the different invoice statuses
 */
export const InvoiceStatusEnum = (name: string) =>
    mysqlEnum(name, convertEnum(invoiceStatuses))

/**
 * An Enumeration for the Request Status
 */
export const RequestStatusEnum = (name: string) =>
    mysqlEnum(name, convertEnum(requestStatuses))

/**
 * An Enumeration for the Commission Availability
 */
export const CommissionAvailabilityEnum = (name: string) =>
    mysqlEnum(name, convertEnum(commissionAvalabilities))

export const DownloadTypeEnum = (name: string) =>
    mysqlEnum(name, convertEnum(downloadTypes))

export const ChargeMethodEnum = (name: string) =>
    mysqlEnum(name, convertEnum(chargeMethods))

export const ConStatusEnum = (name: string) => mysqlEnum(name, convertEnum(conStatus))
export const PurchaseStatusEnum = (name: string) =>
    mysqlEnum(name, convertEnum(purchaseStatus))

//////////////////////////////////////////////////////////
// Tables
//////////////////////////////////////////////////////////

/**
 * Delivery
 *
 * Table for storing the delivery a user has on their account,
 * whether it's through purchasing products or through the commissions
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
 * Artist
 *
 * Holds all the information for the artist
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
 * Artist Code
 *
 * Artist Code used for verification and entry to become an artist
 */
export const artistCodes = createTable('artist_code', {
    id: varchar('id', { length: 128 }).primaryKey(),
    code: varchar('code', { length: 128 }).notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at')
})

/**
 * Artist Verification
 *
 * Holds verification information for the submitted by the user
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
 * Portfolio
 *
 * Holds all information for an artist's portfolio
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
 * Commissions
 *
 * Holds all information for a commission
 */
export const commissions = createTable('commission', {
    id: varchar('id', { length: 128 }).primaryKey(),
    artistId: text('artist_id').notNull(),
    price: int('price').notNull(),
    rating: decimal('rating', { precision: 2, scale: 1 }).notNull(),
    adultContent: boolean('adult_content').default(false).notNull(),

    formId: text('form_id').notNull(),

    title: text('title').notNull(),
    description: text('description').notNull(),
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

export const products = createTable('products', {
    id: varchar('id', { length: 128 }).primaryKey(),
    name: varchar('name', { length: 128 }).notNull(),
    description: json('description').$type<JSONContent>(),
    published: boolean('published').default(false).notNull(),
    isFree: boolean('is_free').default(false).notNull(),

    createdAt: timestamp('created_at').defaultNow(),

    price: int('price').notNull(),
    images: json('images').$type<string[]>().notNull(),
    download: json('download').$type<DownloadData>().notNull(),

    artistId: varchar('artist_id', { length: 128 }).notNull()
})

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
 * Invoice
 *
 * Holds all information for an invoice
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
 * Form
 *
 * Holds all information for a form
 */
export const forms = createTable('form', {
    id: varchar('id', { length: 128 }).primaryKey(),
    artistId: text('artist_id').notNull(),
    commissionId: json('commission_id').$type<string[]>(),

    name: text('name').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    content: json('content').$type<FormElementInstance[]>().default([])
})

/**
 * Request
 *
 * Holds all information for a request
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
 * Kanban
 *
 * Holds all information for a kanban
 */
export const kanbans = createTable('kanban', {
    id: varchar('id', { length: 128 }).primaryKey(),
    requestId: text('request_id').notNull(),

    containers: json('containers'),
    tasks: json('tasks'),

    createdAt: timestamp('created_at').defaultNow().notNull()
})

export const chats = createTable('chats', {
    id: varchar('id', { length: 128 }).primaryKey(),

    requestId: varchar('request_id', { length: 128 }).notNull(),
    commissionId: varchar('commission_id', { length: 128 }).notNull(),
    artistId: varchar('artist_id', { length: 128 }).notNull(),

    userIds: json('user_ids').$type<string[]>().notNull(),

    messageRedisKey: text('message_redis_key').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull()
})

export const conSignUp = createTable(
    'con_sign_up',
    {
        id: varchar('id', { length: 128 }).primaryKey(),

        name: varchar('name', { length: 128 }).notNull(),
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
 * Download Relations
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
 */
export const kanbanRelations = relations(kanbans, ({ one }) => ({
    request: one(requests, {
        fields: [kanbans.requestId],
        references: [requests.id]
    })
}))

/**
 * Product Relations
 */
export const productRelations = relations(products, ({ one, many }) => ({
    artist: one(artists, {
        fields: [products.artistId],
        references: [artists.id]
    }),
    purchases: many(purchase)
}))

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
