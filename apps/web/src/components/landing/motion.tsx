'use client'

import type { HTMLMotionProps, Transition } from 'motion/react'
import { motion, useReducedMotion } from 'motion/react'

const easeOut = [0.22, 1, 0.36, 1] as const

const revealTransition: Transition = {
    duration: 0.85,
    ease: easeOut,
}

export function Reveal({
    children,
    className,
    delay = 0,
    ...props
}: HTMLMotionProps<'div'> & { delay?: number }) {
    const reduceMotion = useReducedMotion()

    return (
        <motion.div
            className={className}
            initial={
                reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }
            }
            transition={{ ...revealTransition, delay }}
            viewport={{ margin: '-60px', once: true }}
            whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            {...props}
        >
            {children}
        </motion.div>
    )
}

export function RevealOnMount({
    children,
    className,
    delay = 0,
    ...props
}: HTMLMotionProps<'div'> & { delay?: number }) {
    const reduceMotion = useReducedMotion()

    return (
        <motion.div
            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            className={className}
            initial={
                reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }
            }
            transition={{ ...revealTransition, delay }}
            {...props}
        >
            {children}
        </motion.div>
    )
}
