"use client";

import Image from "next/image";
import { LandingSection } from "./landing-section";
import { Reveal } from "./motion";
import { SectionHeader } from "./section-header";

const pillars = [
  {
    id: "privacy",
    title: "Privacy by architecture",
    body: "Nemu is built so your home stays yours. Control runs locally, without shipping your life to someone else's cloud.",
    sticker: "/this-is-fine.png",
    stickerAlt: "Nemu looking calm while everything stays local",
  },
  {
    id: "local",
    title: "Local-first, cloud when needed",
    body: "Prefer your LAN for speed and sovereignty. Reach your controller remotely only when you choose never as the default.",
    sticker: "/dizzy.png",
    stickerAlt: "Nemu spinning happily on your own network",
  },
  {
    id: "open",
    title: "Open source, inspectable",
    body: "Read the code. Fork it. Host it. Nemu is Apache-2.0 so you can trust what runs inside your walls.",
    sticker: "/note-take.png",
    stickerAlt: "Nemu taking notes on the open-source code",
  },
] as const;

export function Pillars() {
  return (
    <LandingSection id="why">
      <Reveal>
        <SectionHeader
          badge="Why Nemu"
          description="Three principles that guide every design decision from the protocol to the controller running on your network."
          title="Smart home without the surveillance tax"
        />
      </Reveal>

      <div className="flex flex-col gap-12 lg:flex-row lg:items-stretch lg:gap-0 lg:divide-x lg:divide-border">
        {pillars.map((pillar, index) => (
          <Reveal
            className="flex flex-1 flex-col lg:px-8 last:lg:pr-0 first:lg:pl-0"
            delay={index * 0.1}
            key={pillar.id}
          >
            <Image
              alt={pillar.stickerAlt}
              className="mb-5 h-auto w-28 drop-shadow-md sm:w-32"
              height={160}
              src={pillar.sticker}
              width={160}
            />
            <p className="font-medium text-primary text-xs uppercase tracking-widest">
              {String(index + 1).padStart(2, "0")}
            </p>
            <h3
              className="mt-2 font-bold font-heading text-2xl text-foreground tracking-tight"
              id={pillar.id}
            >
              {pillar.title}
            </h3>
            <p className="mt-4 max-w-sm text-base text-muted-foreground leading-relaxed">
              {pillar.body}
            </p>
          </Reveal>
        ))}
      </div>
    </LandingSection>
  );
}
