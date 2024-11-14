import { SignedIn, SignedOut } from '@clerk/nextjs'
import SearchBar from '~/components/search'
import { FullLogo } from '~/components/ui/logo'

export default function StandarLayout(props: { children: React.ReactNode }) {
    return (
        <main className="container mx-auto min-h-screen w-full">
            <Navbar />
            <div className="py-5">{props.children}</div>
            <Footer />
        </main>
    )
}

function Navbar() {
    return (
        <header className="flex w-full items-center justify-between gap-5 py-5">
            <FullLogo />
            <SearchBar />
            <nav>
                <SignedIn>
                    <>Signed In</>
                </SignedIn>
                <SignedOut>
                    <>SIgned Out</>
                </SignedOut>
            </nav>
        </header>
    )
}

function Footer() {
    return <footer>Footer</footer>
}
