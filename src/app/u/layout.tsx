import NemuImage from '~/components/nemu-image'
import Logo from '~/components/ui/logo'

export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen w-full lg:grid lg:grid-cols-2">
            <div className="flex h-full flex-col items-center justify-center bg-base-300 py-12">
                <Logo />
                <div className="mx-auto grid gap-6 p-6">{children}</div>
            </div>
            <div className="hidden bg-base-100 lg:block">
                <NemuImage
                    src={'/bg/u.png'}
                    alt="background image"
                    width={1920}
                    height={1080}
                    className="h-full w-full object-cover"
                />
            </div>
        </div>
    )
}
