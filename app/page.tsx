import Link from "next/link";
import DefaultPageLayout from "./(default)/layout";

export default async function Home() {
    return (
        <DefaultPageLayout>
            <main className='flex flex-wrap container mx-auto'>
                <Link href={'/artists'} className="w-full">
                    <div className="bg-gradient-to-r from-primary to-azure rounded-3xl py-10 px-20">
                        <div className="inline-block">
                            <h1>Artists Wanted!</h1>
                            <p>Something clever here!</p>

                            <span className="mt-20 border-white border-2 p-5 hover:underline inline-block">Click Here to become an artist!</span>
                        </div>

                        <div className="float-right">
                            <p>Nemu With Artist Wanted go here</p>
                        </div>
                    </div>
                </Link>
            </main>
        </DefaultPageLayout>
  )
}
