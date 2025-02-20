// Example model schema from the Drizzle docs
// https://orm.drizzle.team/docs/sql-schema-declaration

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
    type ConStatus
} from '~/lib/structures'

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

    user_id: text('user_id').notNull(),
    artist_id: text('artist_id').notNull(),

    request_id: text('request_id'),

    ut_key: text('ut_key').notNull(),
    type: DownloadTypeEnum('download_type').$type<DownloadType>().notNull(),
    created_at: timestamp('created_at').defaultNow().notNull(),
    updated_at: timestamp('updated_at')
        .$onUpdate(() => new Date())
        .defaultNow()
        .notNull(),
    version: int('version')
        .default(1)
        .$onUpdate(() => sql`version + 1`)
        .notNull(),

    is_final: boolean('is_final').default(false).notNull()
})

/**
 * Artist
 *
 * Holds all the information for the artist
 */
export const artists = createTable('artist', {
    id: varchar('id', { length: 128 }).primaryKey(),
    user_id: text('user_id').notNull(),
    stripe_account: text('stripe_account').notNull(),
    onboarded: boolean('onboarded').default(false).notNull(),

    created_at: timestamp('created_at').defaultNow().notNull(),

    handle: varchar('handle', { length: 255 }).notNull().unique(),
    about: text('about').default('Peko Peko').notNull(),
    location: varchar('location', { length: 256 }).notNull(),
    terms: text('terms').default('Pls Feed Nemu').notNull(),
    tip_jar_url: text('tip_jar_url'),
    header_photo: text('header_photo')
        .default('DLbLjqbVNirZvpnl7EHDBYPmtFe4irSybTpJxdUn89oQzflX')
        .notNull(),

    automated_message_enabled: boolean('automated_message_enabled').default(false),
    automated_message: text('automated_message'),

    default_charge_method: ChargeMethodEnum('default_charge_method')
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
export const artist_codes = createTable('artist_code', {
    id: varchar('id', { length: 128 }).primaryKey(),
    code: varchar('code', { length: 128 }).notNull().unique(),
    created_at: timestamp('created_at').defaultNow().notNull(),
    expires_at: timestamp('expires_at')
})

/**
 * Artist Verification
 *
 * Holds verification information for the submitted by the user
 */
export const artist_verifications = createTable(
    'artist_verification',
    {
        id: varchar('id', { length: 128 }).primaryKey(),
        user_id: varchar('user_id', { length: 256 }).notNull(),

        requested_handle: varchar('requested_handle', { length: 128 }).notNull().unique(),
        location: varchar('location', { length: 256 }).notNull(),
        twitter: text('twitter'),
        pixiv: text('pixiv'),
        website: text('website'),

        created_at: timestamp('created_at').defaultNow().notNull()
    },
    (artist_verification) => ({
        userIndex: index('user_idx').on(artist_verification.user_id)
    })
)

/**
 * Portfolio
 *
 * Holds all information for an artist's portfolio
 */
export const portfolios = createTable('portfolio', {
    id: varchar('id', { length: 128 }).primaryKey(),
    artist_id: text('artist_id').notNull(),

    ut_key: text('ut_key').notNull(),
    title: varchar('title', { length: 256 }).notNull(),
    adult_content: boolean('adult_content').default(false).notNull(),

    created_at: timestamp('created_at').defaultNow().notNull(),
    request_id: text('request_id')
})

/**
 * Commissions
 *
 * Holds all information for a commission
 */
export const commissions = createTable('commission', {
    id: varchar('id', { length: 128 }).primaryKey(),
    artist_id: text('artist_id').notNull(),
    price: int('price').notNull(),
    rating: decimal('rating', { precision: 2, scale: 1 }).notNull(),
    adult_content: boolean('adult_content').default(false).notNull(),

    form_id: text('form_id').notNull(),

    title: text('title').notNull(),
    description: text('description').notNull(),
    images: json('images')
        .$type<
            {
                ut_key: string
                blur_data?: string
            }[]
        >()
        .notNull(),
    availability: CommissionAvailabilityEnum('availability')
        .$type<CommissionAvailability>()
        .notNull(),
    slug: text('slug').notNull(),

    published: boolean('published').default(false).notNull(),
    created_at: timestamp('created_at').defaultNow().notNull(),

    max_commissions_until_waitlist: int('max_commissions_until_waitlist')
        .default(0)
        .notNull(),
    max_commissions_until_closed: int('max_commissions_until_closed')
        .default(0)
        .notNull(),

    total_requests: int('total_requests').default(0).notNull(),
    new_requests: int('new_requests').default(0).notNull(),
    accepted_requests: int('accepted_requests').default(0).notNull(),
    rejected_requests: int('rejected_requests').default(0).notNull(),

    charge_method: ChargeMethodEnum('charge_method')
        .$type<ChargeMethod>()
        .default('in_full')
        .notNull(),
    downpayment_percentage: int('downpayment_percentage').default(0).notNull(),

    rush_orders_allowed: boolean('rush_orders_allowed').default(false),
    rush_charge: decimal('rush_charge', { precision: 3, scale: 2 }).default('0.00'),
    rush_percentage: boolean('rush_percentage').default(false)
})

export const products = createTable('products', {
    id: varchar('id', { length: 128 }).primaryKey(),
    name: varchar('name', { length: 128 }).notNull(),
    description: text('description'),
    published: boolean('published').default(false).notNull(),

    created_at: timestamp('created_at').defaultNow(),

    price: int('price').notNull(),
    images: json('images').$type<string[]>().notNull(),
    download: varchar('download', { length: 128 }),
    sold_count: int('sold_count').default(0),

    artist_id: varchar('artist_id', { length: 128 }).notNull()
})

export const purchase = createTable('purchase', {
    id: varchar('id', { length: 128 }).primaryKey(),

    product_id: varchar('product_id', { length: 128 }).notNull(),
    user_id: varchar('user_id', { length: 128 }).notNull(),
    artist_id: varchar('artist_id', { length: 128 }).notNull(),

    created_at: timestamp('created_at').defaultNow()
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
    is_final: boolean('is_final').default(false).notNull(),

    stripe_id: varchar('stripe_id', { length: 128 }).notNull(),
    hosted_url: text('hosted_url'),

    items: json('items').$type<InvoiceItem[]>().notNull(),
    created_at: timestamp('created_at').defaultNow().notNull(),

    customer_id: text('customer_id').notNull(),
    stripe_account: text('stripe_account').notNull(),
    total: int('total').notNull(),

    user_id: text('user_id').notNull(),
    artist_id: text('artist_id').notNull(),
    request_id: text('request_id').notNull()
})

/**
 * Form
 *
 * Holds all information for a form
 */
export const forms = createTable('form', {
    id: varchar('id', { length: 128 }).primaryKey(),
    artist_id: text('artist_id').notNull(),
    commission_id: json('commission_id').$type<string[]>(),

    name: text('name').notNull(),
    description: text('description'),
    created_at: timestamp('created_at').defaultNow().notNull(),
    content: json('content').$type<FormElementInstance[]>().default([])
})

/**
 * Request
 *
 * Holds all information for a request
 */
export const requests = createTable('request', {
    id: varchar('id', { length: 128 }).primaryKey(),
    form_id: text('form_id').notNull(),
    user_id: text('user_id').notNull(),
    created_at: timestamp('created_at').defaultNow().notNull(),

    status: RequestStatusEnum('status').$type<RequestStatus>().notNull(),
    commission_id: text('commission_id').notNull(),

    order_id: text('order_id').notNull(),
    invoice_ids: json('invoice_ids').$type<string[]>(),
    kanban_id: text('kanban_id'),
    delivery_id: text('delivery_id'),

    content: json('content').$type<Record<string, string>>().notNull()
})

/**
 * Kanban
 *
 * Holds all information for a kanban
 */
export const kanbans = createTable('kanban', {
    id: varchar('id', { length: 128 }).primaryKey(),
    request_id: text('request_id').notNull(),

    containers: json('containers'),
    tasks: json('tasks'),

    created_at: timestamp('created_at').defaultNow().notNull()
})

export const chats = createTable('chats', {
    id: varchar('id', { length: 128 }).primaryKey(),

    request_id: varchar('request_id', { length: 128 }).notNull(),
    commission_id: varchar('commission_id', { length: 128 }).notNull(),
    artist_id: varchar('artist_id', { length: 128 }).notNull(),

    user_ids: json('user_ids').$type<string[]>().notNull(),

    message_redis_key: text('message_redis_key').notNull(),
    created_at: timestamp('created_at').defaultNow().notNull()
})

export const con_sign_up = createTable(
    'con_sign_up',
    {
        id: varchar('id', { length: 128 }).primaryKey(),

        name: varchar('name', { length: 128 }).notNull(),
        slug: varchar('slug', { length: 128 }).notNull(),
        status: ConStatusEnum('status').$type<ConStatus>().default('active'),

        created_at: timestamp('created_at').defaultNow().notNull(),
        expires_at: timestamp('expires_at').notNull(),
        sign_up_count: int('sign_up_count').default(0).notNull()
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
        fields: [chats.commission_id],
        references: [commissions.id]
    }),
    artist: one(artists, {
        fields: [chats.artist_id],
        references: [artists.id]
    }),
    request: one(requests, {
        fields: [chats.request_id],
        references: [requests.id]
    })
}))

/**
 * Download Relations
 */
export const deliveryRelations = relations(delivery, ({ one }) => ({
    artist: one(artists, {
        fields: [delivery.artist_id],
        references: [artists.id]
    }),
    request: one(requests, {
        fields: [delivery.request_id],
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
    chats: many(chats)
}))

/**
 * Portfolio Relations
 */
export const portfolioRelations = relations(portfolios, ({ one }) => ({
    artist: one(artists, {
        fields: [portfolios.artist_id],
        references: [artists.id]
    }),
    request: one(requests, {
        fields: [portfolios.request_id],
        references: [requests.id]
    })
}))

/**
 * Commission Relations
 */
export const commissionRelations = relations(commissions, ({ one, many }) => ({
    artist: one(artists, {
        fields: [commissions.artist_id],
        references: [artists.id]
    }),
    form: one(forms, {
        fields: [commissions.form_id],
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
        fields: [invoices.artist_id],
        references: [artists.id]
    }),
    request: one(requests, {
        fields: [invoices.request_id],
        references: [requests.id]
    })
}))

/**
 * Form Relations
 */
export const formRelations = relations(forms, ({ one, many }) => ({
    artist: one(artists, {
        fields: [forms.artist_id],
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
        fields: [requests.form_id],
        references: [forms.id]
    }),
    commission: one(commissions, {
        fields: [requests.commission_id],
        references: [commissions.id]
    }),
    invoices: many(invoices),
    kanban: one(kanbans, {
        fields: [requests.kanban_id],
        references: [kanbans.id]
    }),
    delivery: one(delivery, {
        fields: [requests.id],
        references: [delivery.request_id]
    }),
    chat: one(chats, {
        fields: [requests.id],
        references: [chats.request_id]
    })
}))

/**
 * Kanban Relations
 */
export const kanbanRelations = relations(kanbans, ({ one }) => ({
    request: one(requests, {
        fields: [kanbans.request_id],
        references: [requests.id]
    })
}))
