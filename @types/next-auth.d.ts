import { Role } from '@/helpers/user-info'
import { DefaultSession } from 'next-auth'

declare module 'next-auth' {
    interface Session {
        user: {
            user_id?: string
            customer_id?: string
            role?: Role
            provider?: string
            handle?: string
        } & DefaultSession['user']
    }
}