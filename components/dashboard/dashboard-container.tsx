import Link from 'next/link'
import { PlusCircleIcon } from '@heroicons/react/20/solid'

export default function DashboardContainer({
    title,
    addButtonUrl,
    children
}: {
    title: string
    addButtonUrl?: string
    children: React.ReactNode
}) {
    return (
        <main className="py-14 justify-around mr-24 ml-[26rem]">
            <div className="dark:bg-fullblack bg-fullwhite p-10 mx-auto rounded-3xl">
                <div className="pb-10">
                    <h1 className="font-bold text-2xl text-center">{title}</h1>
                    <hr className="seperation" />
                </div>
                {addButtonUrl && (
                    <div className="absolute bottom-20 right-20">
                        <Link
                            href={addButtonUrl}
                            className="bg-gradient-to-r from-primarylight to-primary/80 px-5 py-10 rounded-3xl hover:from-primarylight/80 hover:to-primary/60"
                        >
                            <PlusCircleIcon className="w-14 h-14 inline " />
                        </Link>
                    </div>
                )}

                {children}
            </div>
        </main>
    )
}
