import Link from 'next/link'
import NemuImage from '~/components/nemu-image'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'

export default function Home() {
    return (
        <main className="flex flex-col gap-5">
            <Link
                href={'/artists/apply'}
                className="flex h-[300px] w-full flex-row justify-between gap-5 rounded-xl bg-gradient-to-tr from-primary to-primary/80"
            >
                <div className="flex h-full flex-col gap-5 p-10">
                    <h1 className="text-3xl font-bold">Artists Wanted</h1>
                    <p className="text-lg">Placeholder Copy</p>
                    <div className="flex h-full items-end">
                        <span className="btn btn-outline">Become An Aritst</span>
                    </div>
                </div>
                <div className="flex h-full grow-0 items-end justify-end pr-10">
                    <NemuImage
                        src={'/nemu/artists-wanted.png'}
                        alt="Artists Wanted"
                        width={200}
                        height={200}
                        className=""
                    />
                </div>
            </Link>
            <Tabs defaultValue="all">
                <TabsList className="w-full justify-start bg-base-200">
                    <TabsTrigger value="all">All</TabsTrigger>
                    <TabsTrigger value="artists">Artists</TabsTrigger>
                    <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
                    <TabsTrigger value="commissions">Commissions</TabsTrigger>
                </TabsList>
                <TabsContent value="all">
                    <>All</>
                </TabsContent>
            </Tabs>
        </main>
    )
}
