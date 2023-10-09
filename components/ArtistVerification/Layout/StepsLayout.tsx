'use client'

import Link from "next/link";

import Dot from "@/components/ArtistVerification/Dot";
import VerticalLine from "@/components/ArtistVerification/VerticalLine";
import { usePathname } from "next/navigation";

export default function StepsLayout({ children }: { children: React.ReactNode}) {
    const pathname = usePathname();

    return (
        <article className="flex justify-start gap-12 min-w-[82%]">
            <div className="flex flex-col px-8 py-6 mx-20 h-[200px] border-r-2 border-primary border-dashed">
                <Link href={'/artists/apply/step-one'}>
                    <div className="flex items-center gap-4">
                        <Dot active />
                        <p>Artist Information</p>
                    </div>
                </Link>
                <VerticalLine active />
                <Link href={'/artists/apply/step-two'}>
                    <div className="flex items-center gap-4">
                        <Dot active={false} />
                        <p>Verification Method</p>
                    </div>
                </Link>
                <VerticalLine active={false} />
                <Link href={'/artists/apply/step-one'}>
                    <div className="flex items-center gap-4">
                        <Dot active={false} />
                        <p>What next?</p>
                    </div>
                </Link>
            </div>
            <form className="xl:w-[600px] w-200px">
                {children}
            </form>
        </article>
    )
}