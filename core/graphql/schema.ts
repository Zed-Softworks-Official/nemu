// Types
import './types/user'
import './types/artist'
import './types/artist-code'
import './types/commission'
import './types/portfolio'
import './types/store-item'
import './types/purchased'
import './types/social'
import './types/forms'
import './types/form-submissions'

import { builder } from './builder'

export const schema = builder.toSchema()