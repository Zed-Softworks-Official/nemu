'use client'

import Link from 'next/link'

import Dot from '@/components/artist-verification/ui/Dot'
import VerticalLine from '@/components/artist-verification/ui/VerticalLine'
import { usePathname } from 'next/navigation'
import StepTitle from '../ui/StepTitle'

export default function StepsLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()

    const activeOne = pathname.includes('/step-one')
    const activeTwo = pathname.includes('/step-two')
    const activeThree = pathname.includes('/step-three')

    return (
        <article className="flex flex-col justify-start gap-12 max-w-6xl">
            <ul className="steps">
                <li className="step step-primary">Artist Information</li>
                <li className="step before:!bg-base-100 after:!bg-base-100">
                    Verification Method
                </li>
                <li className="step before:!bg-base-100 after:!bg-base-100">
                    What Next?
                </li>
            </ul>
            <div className="divider"></div>
            <form className="xl:w-[600px] w-[200px] mx-auto">{children}</form>
        </article>
    )
}
