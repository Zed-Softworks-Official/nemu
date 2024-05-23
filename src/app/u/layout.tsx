import NemuImage from '~/components/nemu-image'

export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen w-full lg:grid lg:grid-cols-2">
            <div className="flex h-full items-center justify-center bg-base-300 py-12">
                <div className="mx-auto grid w-[350px] gap-6 p-6">{children}</div>
            </div>
            <div className="hidden bg-base-100 lg:block">
                <NemuImage
                    src={'/bg.jpg'}
                    alt="background image"
                    width={1920}
                    height={1080}
                    className="h-full w-full object-cover "
                />
            </div>
        </div>
    )
}
