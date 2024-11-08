import Link from 'next/link'
import NemuImage from '~/components/nemu-image'

export default function Footer() {
    return (
        <div className="sticky top-[100%] mt-10 w-full">
            <div className="bg-base-200">
                <footer className="container footer mx-auto p-10 text-base-content">
                    <aside className="flex h-full flex-col justify-between">
                        <NemuImage
                            src={'/zed-logo.svg'}
                            alt="zedsoftworks logo"
                            width={50}
                            height={50}
                        />
                        <p>
                            &copy; {new Date().getFullYear()}{' '}
                            <Link href="https://zedsoftworks.dev" target="_blank">
                                Zed Softworks LLC
                            </Link>
                        </p>
                    </aside>
                    <nav>
                        <h6 className="footer-title">Artists</h6>
                        {/*<Link href={'/featured-artists'} className="link-hover link">
                            Featured Artists
                        </Link> */}
                        <Link href={'/artists/apply'} className="link-hover link">
                            Become an Artist
                        </Link>
                        <Link href={'/artists/supporter'} className="link-hover link">
                            Become a Supporter
                        </Link>
                    </nav>
                    <nav>
                        <h6 className="footer-title">Company</h6>
                        <Link href={'/roadmap'} className="link-hover link">
                            Roadmap
                        </Link>
                    </nav>
                    <nav>
                        <h6 className="footer-title">Legal</h6>
                        <Link className="link-hover link" href={'/terms'}>
                            Terms of Service
                        </Link>
                        <Link href={'/privacy'} className="link-hover link">
                            Privacy Policy
                        </Link>
                    </nav>
                </footer>
            </div>
        </div>
    )
}
