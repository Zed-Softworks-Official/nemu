import Link from 'next/link'
import { Button } from '@nemu/ui/components/button'
import { Separator } from '@nemu/ui/components/separator'
import { Logo } from '../logo'
import { GitHubIcon } from './github-icon'

export function SiteFooter() {
    return (
        <footer className="border-border border-t bg-background">
            <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-12 sm:flex-row sm:items-end sm:justify-between sm:px-8">
                <div>
                    <div className="flex items-center gap-3">
                        <Logo />
                    </div>
                    <p className="mt-3 text-muted-foreground text-sm">
                        Made by Zed Softworks
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                    <Button asChild size="sm" variant="ghost">
                        <a
                            href={
                                'https://github.com/Zed-Softworks-Official/nemu'
                            }
                            rel="noopener noreferrer"
                            target="_blank"
                        >
                            <GitHubIcon
                                className="size-4"
                                data-icon="inline-start"
                            />
                            GitHub
                        </a>
                    </Button>
                    <Button asChild size="sm" variant="ghost">
                        <a href="#waitlist">Waitlist</a>
                    </Button>
                    <Button asChild size="sm" variant="ghost">
                        <Link href="/">Home</Link>
                    </Button>
                </div>
            </div>
            <Separator />
            <p className="mx-auto max-w-6xl px-5 py-5 text-muted-foreground text-xs sm:px-8">
                &copy; {new Date().getFullYear()} Zed Softworks. Open source
                under Apache-2.0.
            </p>
        </footer>
    )
}
