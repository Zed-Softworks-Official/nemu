'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { motion } from 'motion/react'
import { useIntersectionObserver } from '@uidotdev/usehooks'

import NemuImage from '~/components/nemu-image'
import { Badge, type BadgeProps } from '~/components/ui/badge'
import {
    Card,
    CardTitle,
    CardDescription,
    CardHeader,
    CardContent,
    CardFooter
} from '~/components/ui/card'
import Loading from '~/components/ui/loading'

import { api, type RouterOutputs } from '~/trpc/react'

export function InfiniteCommissions() {
    const [ref, entry] = useIntersectionObserver({
        root: null,
        threshold: 0,
        rootMargin: '0px'
    })

    const query = api.home.getCommissionsInfinite.useInfiniteQuery(
        {
            limit: 10
        },
        {
            getNextPageParam: (last_page) => last_page.next_cursor
        }
    )

    useEffect(() => {
        if (entry?.isIntersecting && !query.isFetching && query.hasNextPage) {
            void query.fetchNextPage()
        }
    }, [entry, query])

    return (
        <div className="mt-10 flex h-full w-full flex-1 flex-col items-center justify-center gap-5">
            <motion.div
                className="columns-1 gap-4 space-y-4 sm:columns-2 lg:columns-3 xl:columns-4"
                animate={'visible'}
                variants={{
                    hidden: { opacity: 0, y: 20 },
                    visible: {
                        opacity: 1,
                        y: 0,
                        transition: {
                            delayChildren: 0.3,
                            staggerChildren: 0.2
                        }
                    }
                }}
                initial={'hidden'}
            >
                {query.data?.pages.map(({ res }) =>
                    res.map((commission) => (
                        <motion.div
                            key={commission.id}
                            initial={'hidden'}
                            animate={'visible'}
                            variants={{
                                hidden: { opacity: 0, y: 20 },
                                visible: { opacity: 1, y: 0 }
                            }}
                            className="break-inside-avoid"
                        >
                            <CommissionCard commission={commission} />
                        </motion.div>
                    ))
                )}
            </motion.div>
            <div ref={ref}></div>
            {query.isLoading && <Loading />}
        </div>
    )
}

function CommissionCard(props: {
    commission: RouterOutputs['home']['getCommissionsInfinite']['res'][number]
}) {
    let badge_variant: BadgeProps['variant'] = 'default'
    switch (props.commission.availability) {
        case 'closed':
            badge_variant = 'destructive'
            break
        case 'waitlist':
            badge_variant = 'warning'
            break
        default:
            badge_variant = 'default'
            break
    }

    return (
        <Link
            href={`/@${props.commission.artist.handle}/commission/${props.commission.slug}`}
            scroll={false}
        >
            <Card>
                <CardHeader className="aspect-square w-full overflow-hidden rounded-md">
                    <NemuImage
                        src={props.commission.featuredImage}
                        alt={props.commission.title}
                        width={200}
                        height={200}
                        className="h-full w-full object-cover"
                    />
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                    <div className="flex w-full flex-col items-center justify-between sm:flex-row">
                        <CardTitle>{props.commission.title}</CardTitle>
                        <Badge variant={badge_variant}>
                            {props.commission.availability}
                        </Badge>
                    </div>
                    <CardDescription className="text-muted-foreground">
                        {props.commission.description}
                    </CardDescription>
                </CardContent>
                <CardFooter className="flex flex-col items-start">
                    <span className="text-sm font-medium">{props.commission.price}</span>
                    <span className="text-muted-foreground text-xs">
                        by @{props.commission.artist.handle}
                    </span>
                </CardFooter>
            </Card>
        </Link>
    )
}
