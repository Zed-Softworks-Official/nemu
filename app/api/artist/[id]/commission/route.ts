import { prisma } from '@/lib/prisma'

import { NextResponse } from 'next/server'
import {
    CommissionAvailability,
    CommissionResponse,
    StatusCode
} from '@/helpers/api/request-inerfaces'

export async function GET(req: Request, { params }: { params: { id: string } }) {
    const artist = await prisma.user.findFirst({
        where: {
            id: params.id
        },
        include: {
            artist: {
                include: {
                    commissions: true
                }
            }
        }
    })

    return NextResponse.json<CommissionResponse>({
        status: StatusCode.Success,
        commissions: [
            {
                name: 'Test Commission',
                description: 'This is a description',
                price: 300,

                rush: false,

                featured_image: '/nemu/sparkles.png',
                availability: CommissionAvailability.Open,

                images: ['/nemu/artists-wanted.png', '/nemu/this-is-fine.png'],
                prod_id: '231241',
                slug: 'sparkles'
            },
            {
                name: 'Waitlist Commission',
                description: 'Wow this is really something huh',
                price: 120,

                rush: false,

                featured_image: '/nemu/this-is-fine.png',
                availability: CommissionAvailability.Waitlist,

                images: ['/nemu/sparkles.png', '/nemu/artists-wanted.png'],
                prod_id: '231241',
                slug: 'this-is-fine'
            },
            {
                name: 'Another Commission',
                description: 'This is a pretty cool description',
                price: 250,

                rush: false,

                featured_image: '/nemu/artists-wanted.png',
                availability: CommissionAvailability.Closed,

                images: ['/nemu/sparkles.png', '/nemu/this-is-fine.png'],
                prod_id: '231241',
                slug: 'artists-wanted'
            }
        ]
    })
}
