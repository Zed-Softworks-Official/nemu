import { NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import crypto from 'node:crypto'

import { env } from '~/env'

export async function POST() {
    const user = await currentUser()

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user_hash = crypto
        .createHmac('sha256', env.FEATUREBASE_VERIFICATION_SECRET)
        .update(user.id)
        .digest('hex')

    return NextResponse.json({ user_hash })
}
