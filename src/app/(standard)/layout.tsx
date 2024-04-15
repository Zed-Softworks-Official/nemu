import StandardNavbar from '~/components/navbar/standard-navbar'
import Footer from '~/components/footer'

export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <main>
            <StandardNavbar />
            <div className="container mx-auto min-h-screen">{children}</div>
            <Footer />
        </main>
    )
}
