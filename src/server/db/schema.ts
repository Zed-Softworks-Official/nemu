import { sql, relations } from 'drizzle-orm'

import {
    pgTableCreator,
    varchar,
    boolean,
    timestamp,
    index,
    decimal,
    json,
    integer,
    text
} from 'drizzle-orm/pg-core'

import {
    UserRoleEnum,
    cuid,
    customJson,
    CommissionAvailabilityEnum,
    RequestStatusEnum,
    InvoiceStatusEnum
} from '~/server/db/types'

import { UserRole, NemuImageData, SocialAccount } from '~/core/structures'

export const createTable = pgTableCreator((name) => `nemu_${name}`)

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
    clerk_id: varchar('clerk_id').primaryKey(),
    role: UserRoleEnum('role').default(UserRole.Standard)
})

/**
 * Stripe Customer Ids
 *
 * Holds the link between a user, artist, and both customer id and stripe account
 */
export const stripe_customer_ids = createTable('stripe_customer_ids', {
    id: cuid('id').primaryKey(),
    user_id: varchar('user_id').notNull(),
    artist_id: varchar('artist_id').notNull(),

    customer_id: varchar('customer_id').notNull(),
    stripe_account: varchar('stripe_account').notNull(),

    created_at: timestamp('created_at')
        .default(sql`CURRENT_TIMESTAMP`)
        .notNull()
})

/**
 * Downloads
 *
 * Table for storing the downloads a user has on their account,
 * whether it's through purchasing products or through the commissions
 */
export const downloads = createTable('download', {
    id: cuid('id').primaryKey(),
    user_id: varchar('user_id').notNull(),
    file_key: varchar('file_key', { length: 60 }).notNull(),
    receipt_url: varchar('receipt_url'),

    created_at: timestamp('created_at')
        .default(sql`CURRENT_TIMESTAMP`)
        .notNull(),

    artist_id: varchar('artist_id').notNull(),
    product_id: varchar('product_id'),
    commission_id: varchar('commission_id'),
    request_id: varchar('request_id')
})

/**
 * Reviews
 *
 * Table for storing the reviews a user has created on certain products
 * and/or commissions
 */
export const reviews = createTable('review', {
    id: cuid('id').primaryKey(),
    user_id: varchar('user_id').notNull(),
    rating: decimal('rating', { precision: 2, scale: 1 }).notNull(),
    content: varchar('content', { length: 256 }).notNull(),
    created_at: timestamp('created_at')
        .default(sql`CURRENT_TIMESTAMP`)
        .notNull(),
    delivered: boolean('delivered').default(false),

    commission_id: varchar('commission_id'),
    product_id: varchar('product_id'),
    request_id: varchar('submission_id').unique()
})

/**
 * Favorites
 *
 * Table for storing the favorites a user has created on certain products
 * and/or commissions
 */
export const favorites = createTable('favorite', {
    id: cuid('id').primaryKey(),
    user_id: varchar('user_id').notNull(),
    artist_id: varchar('artist_id').notNull(),
    created_at: timestamp('created_at')
        .default(sql`CURRENT_TIMESTAMP`)
        .notNull(),

    commission_id: varchar('commission_id'),
    product_id: varchar('product_id')
})

/**
 * Artist
 *
 * Holds all the information for the artist
 */
export const artists = createTable('artist', {
    id: cuid('id').primaryKey(),
    user_id: varchar('user_id').notNull(),
    stripe_account: varchar('stripe_account').notNull(),

    created_at: timestamp('created_at')
        .default(sql`CURRENT_TIMESTAMP`)
        .notNull(),

    handle: varchar('handle').notNull().unique(),
    about: varchar('about', { length: 256 }).default('Peko Peko').notNull(),
    location: varchar('location', { length: 256 }).notNull(),
    terms: varchar('terms').default('Pls Feed Nemu').notNull(),
    tip_jar_url: varchar('tip_jar_url'),
    header_photo: varchar('header_photo').default('/curved0.jpg').notNull(),
    ut_key: varchar('ut_key'),

    supporter: boolean('supporter').default(false).notNull(),
    zed_customer_id: varchar('zed_customer_id'),

    automated_message_enabled: boolean('automated_message_enabled').default(false),
    automated_message: varchar('automated_message'),

    socials: customJson<SocialAccount>('socials').array().notNull()
})

/**
 * Artist Code
 *
 * Artist Code used for verification and entry to become an artist
 */
export const artist_codes = createTable(
    'artist_code',
    {
        id: cuid('id').primaryKey(),
        code: varchar('code').notNull().unique(),
        created_at: timestamp('created_at')
            .default(sql`CURRENT_TIMESTAMP`)
            .notNull()
    },
    (artist_code) => ({
        codeIndex: index('code_idx').on(artist_code.code)
    })
)

/**
 * Artist Verification
 *
 * Holds verification information for the submitted by the user
 */
export const artist_verifications = createTable(
    'artist_verification',
    {
        id: cuid('id').primaryKey(),
        user_id: varchar('user_id').notNull(),

        requested_handle: varchar('requested_handle').notNull().unique(),
        location: varchar('location', { length: 256 }).notNull(),
        twitter: varchar('twitter'),
        pixiv: varchar('pixiv'),
        website: varchar('website'),

        created_at: timestamp('created_at')
            .default(sql`CURRENT_TIMESTAMP`)
            .notNull()
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
    id: cuid('id').primaryKey(),
    artist_id: varchar('artist_id').notNull(),

    image_url: varchar('image_url').notNull(),
    ut_key: varchar('ut_key').notNull(),
    title: varchar('title', { length: 256 }).notNull(),

    created_at: timestamp('created_at')
        .default(sql`CURRENT_TIMESTAMP`)
        .notNull(),
    request_id: varchar('request_id')
})

/**
 * Artist Corner
 *
 * Holds all information for a product on the artist's corner
 */
export const products = createTable('product', {
    id: cuid('id').primaryKey(),
    artist_id: varchar('artist_id').notNull(),

    title: varchar('title').notNull(),
    description: varchar('description'),
    price: decimal('price', { precision: 2, scale: 2 }).notNull(),
    images: varchar('images').array(),
    ut_keys: varchar('ut_keys').array(),
    downloadable_asset: varchar('downloadable_asset', { length: 256 }),
    slug: varchar('slug'),

    published: boolean('published').default(true),
    created_at: timestamp('created_at')
        .default(sql`CURRENT_TIMESTAMP`)
        .notNull()
})

/**
 * Commissions
 *
 * Holds all information for a commission
 */
export const commissions = createTable('commission', {
    id: cuid('id').primaryKey(),
    artist_id: varchar('artist_id').notNull(),
    price: decimal('price', { precision: 4, scale: 2 }).notNull(),
    rating: decimal('rating', { precision: 2, scale: 1 }).notNull(),

    form_id: varchar('form_id').notNull(),

    title: varchar('title').notNull(),
    description: text('description').notNull(),
    images: customJson<NemuImageData>('images').array().notNull(),
    availability: CommissionAvailabilityEnum('availability').notNull(),
    slug: varchar('slug').notNull(),

    published: boolean('published').default(false).notNull(),
    created_at: timestamp('created_at')
        .default(sql`CURRENT_TIMESTAMP`)
        .notNull(),

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
    id: cuid('id').primaryKey(),
    sent: boolean('sent').default(false).notNull(),
    hosted_url: varchar('hosted_url'),
    status: InvoiceStatusEnum('status').notNull(),

    stripe_id: varchar('stripe_id').notNull(),
    created_at: timestamp('created_at')
        .default(sql`CURRENT_TIMESTAMP`)
        .notNull(),

    customer_id: varchar('customer_id').notNull(),
    stripe_account: varchar('stripe_account').notNull(),

    user_id: varchar('user_id').notNull(),
    artist_id: varchar('artist_id').notNull(),
    request_id: varchar('request_id').notNull()
})

/**
 * Invoice Item
 *
 * Holds all information for an invoice item
 */
export const invoice_items = createTable('invoice_item', {
    id: cuid('id').primaryKey(),
    invoice_id: varchar('invoice_id').notNull(),

    name: varchar('name').notNull(),
    price: decimal('price', { precision: 4, scale: 2 }).notNull(),
    quantity: integer('quantity').notNull(),

    created_at: timestamp('created_at')
        .default(sql`CURRENT_TIMESTAMP`)
        .notNull()
})

/**
 * Form
 *
 * Holds all information for a form
 */
export const forms = createTable('form', {
    id: cuid('id').primaryKey(),
    artist_id: varchar('artist_id').notNull(),
    commission_id: varchar('commission_id').array(),

    name: varchar('name').notNull(),
    description: varchar('description'),
    created_at: timestamp('created_at')
        .default(sql`CURRENT_TIMESTAMP`)
        .notNull(),
    content: json('content').default([])
})

/**
 * Request
 *
 * Holds all information for a request
 */
export const requests = createTable('request', {
    id: cuid('id').primaryKey(),
    form_id: varchar('form_id').notNull(),
    user_id: varchar('user_id').notNull(),
    created_at: timestamp('created_at')
        .default(sql`CURRENT_TIMESTAMP`)
        .notNull(),

    status: RequestStatusEnum('status').notNull(),
    commission_id: varchar('commission_id').notNull(),

    order_id: varchar('order_id').notNull(),
    invoice_id: varchar('invoice_id'),
    kanban_id: varchar('kanban_id'),
    download_id: varchar('download_id'),

    sendbird_channel_url: varchar('sendbird_channel_url'),

    content: json('content').notNull()
})

/**
 * Kanban
 *
 * Holds all information for a kanban
 */
export const kanbans = createTable('kanban', {
    id: cuid('id').primaryKey(),
    request_id: varchar('request_id').notNull(),

    containers: json('containers'),
    tasks: json('tasks'),

    created_at: timestamp('created_at')
        .default(sql`CURRENT_TIMESTAMP`)
        .notNull()
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
