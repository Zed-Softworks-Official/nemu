import './types/user'
import './types/artist'
import './types/commission'

import { builder } from './builder'

export const schema = builder.toSchema()