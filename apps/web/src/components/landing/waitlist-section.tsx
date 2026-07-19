"use client";

import { Waitlist } from "@clerk/nextjs";
import Image from "next/image";
import { LandingSection } from "./landing-section";
import { Float, Reveal } from "./motion";
import { SectionHeader } from "./section-header";

export function WaitlistSection() {
  return (
    <LandingSection glow id="waitlist">
      <div className="flex flex-col items-center gap-10 lg:flex-row lg:items-center lg:justify-center lg:gap-16">
        <Reveal className="relative shrink-0">
          <Float>
            <Image
              alt="Nemu sparkling with excitement"
              className="mx-auto h-auto w-48 drop-shadow-[0_0_32px_oklch(0.78_0.14_220_/20%)] sm:w-56 lg:w-64"
              height={320}
              src="/sparkle.png"
              width={320}
            />
          </Float>
        </Reveal>

        <Reveal
          className="w-full max-w-md text-center lg:text-left"
          delay={0.12}
        >
          <SectionHeader
            badge="Early access"
            className="mx-auto mb-8 lg:mx-0"
            description="Join the waitlist and be first in line when Nemu opens the door."
            title="Get early access"
          />
          <div className="flex justify-center lg:justify-start">
            <Waitlist />
          </div>
        </Reveal>
      </div>
    </LandingSection>
  );
}
