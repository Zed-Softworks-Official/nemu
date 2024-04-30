import Logo from '~/components/ui/logo'
import Link from 'next/link'

export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <div className="h-screen bg-[url('/bg.jpg')] bg-cover">
            <div className="flex h-screen flex-1 flex-wrap items-center justify-center">
                {children}
            </div>
        </div>
    )
}
