import Link from 'next/link'
import NemuImage from '~/components/nemu-image'

export default function Footer() {
    return (
        <div className="sticky top-[100%] w-full mt-10">
            <div className="bg-base-200">
                <footer className="footer p-10 container mx-auto text-base-content">
                    <aside className="h-full flex flex-col justify-between">
                        <NemuImage
                            src={'/zed-logo.svg'}
                            alt="zedsoftworks logo"
                            width={50}
                            height={50}
                        />
                        <p>
                            &copy; {new Date().getFullYear()}{' '}
                            <Link href="https://zedsoftworks.com" target="_blank">
                                Zed Softworks LLC
                            </Link>
                        </p>
                    </aside>
                    <nav>
                        <h6 className="footer-title">Services</h6>
                        <Link href={'/artists/apply'} className="link link-hover">
                            Become an artist
                        </Link>
                        <Link href={'/artists/supporter'} className="link link-hover">
                            Become an Supporter
                        </Link>
                        <Link href={'/roadmap'} className="link link-hover">
                            Roadmap
                        </Link>
                    </nav>
                    <nav>
                        <h6 className="footer-title">Company</h6>
                        <Link
                            href="https://zedsoftworks.com/about"
                            target="_blank"
                            className="link link-hover"
                        >
                            About us
                        </Link>
                        <a className="link link-hover">Contact</a>
                    </nav>
                    <nav>
                        <h6 className="footer-title">Legal</h6>
                        <a className="link link-hover">Terms of use</a>
                        <a className="link link-hover">Privacy policy</a>
                        <a className="link link-hover">Cookie policy</a>
                    </nav>
                </footer>
            </div>
        </div>
    )
}
