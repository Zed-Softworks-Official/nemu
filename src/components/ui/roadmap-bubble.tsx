'use client'

import { motion } from 'framer-motion'

export default function RoadmapBubble() {
    return (
        <div className="relative">
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-base-content/60" />
            <motion.div initial={{ x: -10, opacity: 0 }} animate={{ x: 0, opacity: 1 }}>
                <div className="z-10 aspect-square w-5 rounded-full bg-primary"></div>
            </motion.div>
        </div>
    )
}
