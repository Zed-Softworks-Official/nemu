'use client'

import Link from "next/link";

import Dot from "@/components/ArtistVerification/UI/Dot";
import VerticalLine from "@/components/ArtistVerification/UI/VerticalLine";
import { usePathname } from "next/navigation";
import StepTitle from "../UI/StepTitle";

export default function StepsLayout({ children }: { children: React.ReactNode}) {
    const pathname = usePathname();

    const activeOne = pathname.includes('/step-one');
    const activeTwo = pathname.includes('/step-two');
    const activeThree = pathname.includes('/step-three');

    return (
        <article className="flex justify-start gap-12 min-w-[82%]">
            <div className="flex flex-col px-8 py-6 mx-20 h-[200px] border-r-2 border-primary border-dashed">
                <Link href={'/artists/apply/step-one'}>
                    <div className="flex items-center gap-4">
                        <Dot active={activeOne || activeTwo || activeThree} />
                        <StepTitle active={activeOne || activeTwo || activeThree} title="Artist Information" />
                    </div>
                </Link>
                <VerticalLine active={activeTwo || activeThree} />
                <Link href={'/artists/apply/step-two'}>
                    <div className="flex items-center gap-4">
                        <Dot active={activeTwo || activeThree} />
                        <StepTitle active={activeTwo || activeThree} title="Verification Method" />
                    </div>
                </Link>
                <VerticalLine active={activeThree} />
                <Link href={'/artists/apply/step-three'}>
                    <div className="flex items-center gap-4">
                        <Dot active={activeThree} />
                        <StepTitle active={activeThree} title="What Next?" />
                    </div>
                </Link>
            </div>
            <form className="xl:w-[600px] w-200px">
                {children}
            </form>
        </article>
    )
}