// Example model schema from the Drizzle docs
// https://orm.drizzle.team/docs/sql-schema-declaration

import { relations } from 'drizzle-orm'
import {
    decimal,
    text,
    boolean,
    index,
    mysqlTableCreator,
    timestamp,
    varchar,
    json,
    int
} from 'drizzle-orm/mysql-core'

import {
    UserRoleEnum,
    InvoiceStatusEnum,
    RequestStatusEnum,
    CommissionAvailabilityEnum,
    customJson
} from './types'

import { type SocialAccount, type NemuImageData, UserRole } from '~/core/structures'

/**
 * This is an example of how to use the multi-project schema feature of Drizzle ORM. Use the same
 * database instance for multiple projects.
 *
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const createTable = mysqlTableCreator((name) => `nemu_${name}`)

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

    has_sendbird_account: boolean('has_sendbird_account').default(false),
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
 * Downloads
 *
 * Table for storing the downloads a user has on their account,
 * whether it's through purchasing products or through the commissions
 */
export const downloads = createTable('download', {
    id: varchar('id', { length: 128 }).primaryKey(),
    user_id: text('user_id').notNull(),

    url: text('url').notNull(),
    ut_key: text('ut_key'),

    created_at: timestamp('created_at').defaultNow().notNull(),

    artist_id: text('artist_id').notNull(),
    // product_id: text('product_id'),
    request_id: text('request_id')
})

/**
 * Reviews
 *
 * Table for storing the reviews a user has created on certain products
 * and/or commissions
 */
export const reviews = createTable('review', {
    id: varchar('id', { length: 128 }).primaryKey(),
    user_id: text('user_id').notNull(),
    rating: decimal('rating', { precision: 2, scale: 1 }).notNull(),
    content: varchar('content', { length: 256 }).notNull(),
    created_at: timestamp('created_at').defaultNow().notNull(),
    delivered: boolean('delivered').default(false),

    commission_id: text('commission_id'),
    product_id: text('product_id'),
    request_id: varchar('request_id', { length: 128 })
})

/**
 * Favorites
 *
 * Table for storing the favorites a user has created on certain products
 * and/or commissions
 */
export const favorites = createTable('favorite', {
    id: varchar('id', { length: 128 }).primaryKey(),
    user_id: text('user_id').notNull(),
    artist_id: text('artist_id').notNull(),
    created_at: timestamp('created_at').defaultNow().notNull(),

    commission_id: text('commission_id'),
    product_id: text('product_id')
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

    created_at: timestamp('created_at').defaultNow().notNull(),

    handle: varchar('handle', { length: 255 }).notNull().unique(),
    about: text('about').default('Peko Peko').notNull(),
    location: varchar('location', { length: 256 }).notNull(),
    terms: text('terms').default('Pls Feed Nemu').notNull(),
    tip_jar_url: text('tip_jar_url'),
    header_photo: text('header_photo').default('/curved0.jpg').notNull(),
    ut_key: text('ut_key'),

    supporter: boolean('supporter').default(false).notNull(),
    zed_customer_id: text('zed_customer_id'),

    automated_message_enabled: boolean('automated_message_enabled').default(false),
    automated_message: text('automated_message'),

    socials: customJson<SocialAccount>('socials').$type<SocialAccount[]>().notNull()
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

    image_url: text('image_url').notNull(),
    ut_key: text('ut_key').notNull(),
    title: varchar('title', { length: 256 }).notNull(),

    created_at: timestamp('created_at').defaultNow().notNull(),
    request_id: text('request_id')
})

/**
 * Artist Corner
 *
 * Holds all information for a product on the artist's corner
 */
export const products = createTable('product', {
    id: varchar('id', { length: 128 }).primaryKey(),
    artist_id: text('artist_id').notNull(),

    title: text('title').notNull(),
    description: text('description'),
    price: decimal('price', { precision: 2, scale: 2 }).notNull(),
    images: json('images').$type<string[]>(),
    ut_keys: json('ut_keys').$type<string[]>(),
    downloadable_asset: varchar('downloadable_asset', { length: 256 }),
    slug: text('slug'),

    published: boolean('published').default(true),
    created_at: timestamp('created_at').defaultNow().notNull()
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

    form_id: text('form_id').notNull(),

    title: text('title').notNull(),
    description: text('description').notNull(),
    images: customJson<NemuImageData>('images').$type<NemuImageData[]>().notNull(),
    availability: CommissionAvailabilityEnum('availability').notNull(),
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

    stripe_id: text('stripe_id').notNull(),
    created_at: timestamp('created_at').defaultNow().notNull(),

    customer_id: text('customer_id').notNull(),
    stripe_account: text('stripe_account').notNull(),
    total: int('total').notNull(),

    user_id: text('user_id').notNull(),
    artist_id: text('artist_id').notNull(),
    request_id: text('request_id').notNull()
})

/**
 * Invoice Item
 *
 * Holds all information for an invoice item
 */
export const invoice_items = createTable('invoice_item', {
    id: varchar('id', { length: 128 }).primaryKey(),
    invoice_id: text('invoice_id').notNull(),

    name: text('name').notNull(),
    price: int('price').notNull(),
    quantity: int('quantity').notNull(),

    created_at: timestamp('created_at').defaultNow().notNull()
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
    content: json('content').default([])
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
    download_id: text('download_id'),

    sendbird_channel_url: text('sendbird_channel_url'),

    content: json('content').notNull()
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

//////////////////////////////////////////////////////////
// Relations
//////////////////////////////////////////////////////////

/**
 * User Relations
 */
export const userRelations = relations(users, ({ one, many }) => ({
    artist: one(artists, {
        fields: [users.clerk_id],
        references: [artists.user_id]
    }),
    requests: many(requests),
    downloads: many(downloads),
    reviews: many(reviews),
    favorites: many(favorites),
    customer_ids: many(stripe_customer_ids)
}))

/**
 * Download Relations
 */
export const downloadRelations = relations(downloads, ({ one }) => ({
    user: one(users, {
        fields: [downloads.user_id],
        references: [users.clerk_id]
    }),
    artist: one(artists, {
        fields: [downloads.artist_id],
        references: [artists.id]
    }),
    request: one(requests, {
        fields: [downloads.request_id],
        references: [requests.id]
    })
}))

/**
 * Favorite Relations
 */
export const favoriteRelations = relations(favorites, ({ one }) => ({
    user: one(users, {
        fields: [favorites.user_id],
        references: [users.clerk_id]
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
 * Review Relations
 */
export const reviewRelations = relations(reviews, ({ one }) => ({
    user: one(users, {
        fields: [reviews.user_id],
        references: [users.clerk_id]
    }),
    commission: one(commissions, {
        fields: [reviews.commission_id],
        references: [commissions.id]
    }),
    product: one(products, {
        fields: [reviews.product_id],
        references: [products.id]
    }),
    request: one(requests, {
        fields: [reviews.request_id],
        references: [requests.id]
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
    products: many(products),
    portfolio: many(portfolios),
    forms: many(forms),
    customer_ids: many(stripe_customer_ids),
    invoices: many(invoices)
}))

/**
 * Product Relations
 */
export const productRelations = relations(products, ({ one, many }) => ({
    artist: one(artists, {
        fields: [products.artist_id],
        references: [artists.id]
    }),
    reviews: many(reviews)
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
    reviews: many(reviews),
    requests: many(requests)
}))

/**
 * Invoice Relations
 */
export const invoiceRelations = relations(invoices, ({ one, many }) => ({
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
    }),
    invoice_items: many(invoice_items)
}))

/**
 * Invoice Item Relations
 */
export const invoiceItemsRelations = relations(invoice_items, ({ one }) => ({
    invoice: one(invoices, {
        fields: [invoice_items.invoice_id],
        references: [invoices.id]
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
    download: one(downloads, {
        fields: [requests.download_id],
        references: [downloads.id]
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
