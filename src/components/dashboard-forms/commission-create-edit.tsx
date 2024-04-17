'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import * as z from 'zod'

const commissionSchema = z.object({
    title: z.string().min(2).max(50),
    description: z.string().min(10).max(500),
    form: z.string().min(1),

    price: z.number().min(0).default(0).optional(),

    featured_image: z
        .any(z.instanceof(File).refine((file: File) => file.size != 0))
        .optional(),
    additional_images: z.any().optional(),

    rush: z.boolean().default(false),
    rush_charge: z.number().default(0).optional(),
    rush_percentage: z.boolean().default(false),

    max_commissions_until_waitlist: z.number().default(0).optional(),
    max_commissions_until_closed: z.number().default(0).optional(),

    commission_availability: z.number()
})

type CommissionSchemaType = z.infer<typeof commissionSchema>

export default function CommissionCreateEditForm() {
    const form = useForm<CommissionSchemaType>({
        resolver: zodResolver(commissionSchema),
        mode: 'onSubmit'
    })

    return <></>
}
