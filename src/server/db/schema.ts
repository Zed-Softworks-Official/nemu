// Example model schema from the Drizzle docs
// https://orm.drizzle.team/docs/sql-schema-declaration

import { relations, sql } from 'drizzle-orm'
import {
    decimal,
    text,
    boolean,
    index,
    pgTableCreator,
    timestamp,
    varchar,
    json,
    integer,
    customType,
    pgEnum
} from 'drizzle-orm/pg-core'
import { type FormElementInstance } from '~/components/form-builder/elements/form-elements'

import {
    type SocialAccount,
    UserRole,
    CommissionAvailability,
    InvoiceStatus,
    RequestStatus,
    type InvoiceItem,
    DownloadType,
    ChargeMethod
} from '~/lib/structures'

/**
 * This is an example of how to use the multi-project schema feature of Drizzle ORM. Use the same
 * database instance for multiple projects.
 *
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const createTable = pgTableCreator((name) => `nemu_${name}`)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const enum_to_pg_enum = (m_Enum: any) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    Object.values(m_Enum).map((value: any) => `${value}`) as [string, ...string[]]

/**
 * Creates a custom json schema type
 *
 * @param name - name of the coloumn
 * @returns
 */
export const customJson = <TData>(name: string) =>
    customType<{ data: TData; driverData: string }>({
        dataType: () => 'json',
        toDriver: (value: TData) => JSON.stringify(value)
        // fromDriver: (value: string) => JSON.parse(value) as TData
    })(name)

/**
 * An Enumeration for the user roles
 */
export const UserRoleEnum = pgEnum('role', enum_to_pg_enum(UserRole))

/**
 * Enumeration for the different invoice statuses
 */
export const InvoiceStatusEnum = pgEnum('invoice_status', enum_to_pg_enum(InvoiceStatus))

/**
 * An Enumeration for the Request Status
 */
export const RequestStatusEnum = pgEnum('request_status', enum_to_pg_enum(RequestStatus))

/**
 * An Enumeration for the Commission Availability
 */
export const CommissionAvailabilityEnum = pgEnum(
    'availability',
    enum_to_pg_enum(CommissionAvailability)
)

export const DownloadTypeEnum = pgEnum('download_type', enum_to_pg_enum(DownloadType))

export const ChargeMethodEnum = pgEnum('charge_method', enum_to_pg_enum(ChargeMethod))

//////////////////////////////////////////////////////////
// Tables
//////////////////////////////////////////////////////////

/**
 * Users
 *
 * Holds general user information. Really only the clerk id is needed, but we also
 * store the user role for convenience
 */
export const users = createTable('user', {
    clerk_id: varchar('clerk_id', { length: 256 }).primaryKey(),
    role: UserRoleEnum('role').default(UserRole.Standard),

    artist_id: varchar('artist_id', { length: 128 })
})

/**
 * Stripe Customer Ids
 *
 * Holds the link between a user, artist, and both customer id and stripe account
 */
export const stripe_customer_ids = createTable('stripe_customer_ids', {
    id: varchar('id', { length: 128 }).primaryKey(),
    user_id: text('user_id').notNull(),
    artist_id: text('artist_id').notNull(),

    customer_id: text('customer_id').notNull(),
    stripe_account: text('stripe_account').notNull(),

    created_at: timestamp('created_at').defaultNow().notNull()
})

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
    product_id: text('product_id'),

    ut_key: text('ut_key').notNull(),
    type: DownloadTypeEnum('download_type').$type<DownloadType>().notNull(),
    created_at: timestamp('created_at').defaultNow().notNull(),
    updated_at: timestamp('updated_at')
        .$onUpdate(() => new Date())
        .defaultNow()
        .notNull(),
    version: integer('version')
        .default(1)
        .$onUpdate(() => sql`version + 1`)
        .notNull()
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
    header_photo: text('header_photo').default('/curved0.jpg').notNull(),

    supporter: boolean('supporter').default(false).notNull(),
    zed_customer_id: text('zed_customer_id'),

    automated_message_enabled: boolean('automated_message_enabled').default(false),
    automated_message: text('automated_message'),

    default_charge_method: ChargeMethodEnum('default_charge_method')
        .default(ChargeMethod.InFull)
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
    created_at: timestamp('created_at').defaultNow().notNull()
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
    price: integer('price').notNull(),
    rating: decimal('rating', { precision: 2, scale: 1 }).notNull(),

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
    availability: CommissionAvailabilityEnum('availability').notNull(),
    slug: text('slug').notNull(),

    published: boolean('published').default(false).notNull(),
    created_at: timestamp('created_at').defaultNow().notNull(),

    max_commissions_until_waitlist: integer('max_commissions_until_waitlist')
        .default(0)
        .notNull(),
    max_commissions_until_closed: integer('max_commissions_until_closed')
        .default(0)
        .notNull(),

    total_requests: integer('total_requests').default(0).notNull(),
    new_requests: integer('new_requests').default(0).notNull(),
    accepted_requests: integer('accepted_requests').default(0).notNull(),
    rejected_requests: integer('rejected_requests').default(0).notNull(),

    charge_method: ChargeMethodEnum('charge_method')
        .default(ChargeMethod.InFull)
        .notNull(),
    downpayment_percentage: integer('downpayment_percentage').default(0).notNull(),

    rush_orders_allowed: boolean('rush_orders_allowed').default(false),
    rush_charge: decimal('rush_charge', { precision: 3, scale: 2 }).default('0.00'),
    rush_percentage: boolean('rush_percentage').default(false)
})

/**
 * Invoice
 *
 * Holds all information for an invoice
 */
export const invoices = createTable('invoice', {
    id: varchar('id', { length: 128 }).primaryKey(),
    sent: boolean('sent').default(false).notNull(),
    hosted_url: text('hosted_url'),
    status: InvoiceStatusEnum('status').notNull(),

    items: json('items').$type<InvoiceItem[]>().notNull(),

    stripe_id: text('stripe_id').notNull(),
    created_at: timestamp('created_at').defaultNow().notNull(),

    customer_id: text('customer_id').notNull(),
    stripe_account: text('stripe_account').notNull(),
    total: integer('total').notNull(),

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

    status: RequestStatusEnum('status').notNull(),
    commission_id: text('commission_id').notNull(),

    order_id: text('order_id').notNull(),
    invoice_id: text('invoice_id'),
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

    user_ids: varchar('user_ids', { length: 128 }).array().notNull(),

    message_redis_key: text('message_redis_key').notNull(),
    created_at: timestamp('created_at').defaultNow().notNull()
})

//////////////////////////////////////////////////////////
// Relations
//////////////////////////////////////////////////////////

/**
 * Chat Relations
 */
export const chatRelations = relations(chats, ({ one, many }) => ({
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
    }),
    users: many(users)
}))

/**
 * User Relations
 */
export const userRelations = relations(users, ({ one, many }) => ({
    artist: one(artists, {
        fields: [users.clerk_id],
        references: [artists.user_id]
    }),
    requests: many(requests),
    deliveries: many(delivery),
    customer_ids: many(stripe_customer_ids),
    chats: many(chats)
}))

/**
 * Download Relations
 */
export const deliveryRelations = relations(delivery, ({ one }) => ({
    user: one(users, {
        fields: [delivery.user_id],
        references: [users.clerk_id]
    }),
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
 * Customer Id Relations
 */
export const customerIdRelations = relations(stripe_customer_ids, ({ one }) => ({
    user: one(users, {
        fields: [stripe_customer_ids.user_id],
        references: [users.clerk_id]
    }),
    artist: one(artists, {
        fields: [stripe_customer_ids.artist_id],
        references: [artists.id]
    })
}))

/**
 * Artist Relations
 */
export const artistRelations = relations(artists, ({ one, many }) => ({
    user: one(users, {
        fields: [artists.user_id],
        references: [users.clerk_id]
    }),
    commissions: many(commissions),
    portfolio: many(portfolios),
    forms: many(forms),
    customer_ids: many(stripe_customer_ids),
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
    }),
    user: one(users, {
        fields: [invoices.user_id],
        references: [users.clerk_id]
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
export const requestRelations = relations(requests, ({ one }) => ({
    form: one(forms, {
        fields: [requests.form_id],
        references: [forms.id]
    }),
    user: one(users, {
        fields: [requests.user_id],
        references: [users.clerk_id]
    }),
    commission: one(commissions, {
        fields: [requests.commission_id],
        references: [commissions.id]
    }),
    invoice: one(invoices, {
        fields: [requests.invoice_id],
        references: [invoices.id]
    }),
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
