// Types
import './types/commission'

import './types/products'
import './types/social'
import './types/forms'
import './types/form-submissions'
import './types/stripe-id'
import './types/kanban'
import './types/downloads'
import './types/invoice'
import './types/invoice-items'

import './fields/stripe'
import './fields/artist-verification'

import { builder } from './builder'

export const schema = builder.toSchema()