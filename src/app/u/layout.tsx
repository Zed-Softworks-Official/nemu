import Logo from '~/components/ui/logo'
import Link from 'next/link'

export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <div className="bg-[url('/bg.jpg')] bg-cover h-screen">
            <div className="flex flex-1 flex-wrap justify-center items-center h-screen">
                <div className="bg-base-300/60 p-10 rounded-xl backdrop-blur-3xl flex flex-col gap-5 max-w-xl w-full">
                    <div className="text-center">
                        <Logo />
                        <div className="divider"></div>
                    </div>

                    {children}

                    <div className="footer w-full">
                        <p className="flex text-center w-full justify-center">
                            &copy; {new Date().getFullYear()}
                            <Link
                                href={'https://zedsoftworks.com'}
                                target="_blank"
                                className="link link-hover"
                            >
                                Zed Softworks LLC
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}
