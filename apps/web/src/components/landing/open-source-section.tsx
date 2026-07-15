'use client'

import { Button } from '@nemu/ui/components/button'
import { Logo } from '../logo'
import { GitHubIcon } from './github-icon'
import { LandingSection } from './landing-section'
import { Float, Reveal } from './motion'
import { SectionHeader } from './section-header'

export function OpenSourceSection() {
    return (
        <LandingSection grid id="open-source">
            <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-16">
                <Reveal>
                    <SectionHeader
                        badge="Open source"
                        description="Nemu is Apache-2.0 licensed. Inspect the code, contribute features, and run it on your own terms: no black boxes in your walls."
                        title="Trust what runs inside your home"
                    />
                    <div className="flex flex-wrap gap-3">
                        <Button asChild size="lg">
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
                                Star on GitHub
                            </a>
                        </Button>
                        <Button asChild size="lg" variant="outline">
                            <a href="#waitlist">Join the waitlist</a>
                        </Button>
                    </div>
                    <dl className="mt-10 grid grid-cols-3 gap-6 border-border border-t pt-8">
                        <div>
                            <dt className="text-muted-foreground text-xs uppercase tracking-widest">
                                License
                            </dt>
                            <dd className="mt-1 font-semibold text-foreground">
                                Apache-2.0
                            </dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground text-xs uppercase tracking-widest">
                                Stack
                            </dt>
                            <dd className="mt-1 font-semibold text-foreground">
                                Rust + TypeScript
                            </dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground text-xs uppercase tracking-widest">
                                By
                            </dt>
                            <dd className="mt-1 font-semibold text-foreground">
                                Zed Softworks
                            </dd>
                        </div>
                    </dl>
                </Reveal>

                <Reveal
                    className="relative flex justify-center lg:justify-end"
                    delay={0.15}
                >
                    <Float className="relative">
                        <Logo
                            className="h-auto w-full max-w-xs drop-shadow-[0_0_40px_oklch(0.78_0.14_220_/15%)] sm:max-w-sm"
                            height={400}
                            width={400}
                        />
                    </Float>
                </Reveal>
            </div>
        </LandingSection>
    )
}
