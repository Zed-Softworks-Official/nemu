"use client";

import { cn } from "@nemu/ui/lib/utils";
import { Check, X } from "lucide-react";
import Image from "next/image";
import { LandingSection } from "./landing-section";
import { Reveal } from "./motion";
import { SectionHeader } from "./section-header";

const cloudPoints = [
  "Device data routed through vendor servers",
  "Works until the company changes terms",
  "Automation you hope works",
  "Your home profile becomes their product",
] as const;

const nemuPoints = [
  "Control plane runs on hardware you own",
  "LAN-first for speed and sovereignty",
  "Open source: read, fork, and self-host",
  "Remote access is optional, not mandatory",
] as const;

function PointList({
  items,
  positive,
}: {
  items: readonly string[];
  positive: boolean;
}) {
  return (
    <ul className="mt-6 space-y-3">
      {items.map((item) => (
        <li className="flex gap-3 text-sm leading-relaxed" key={item}>
          <span
            className={cn(
              "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
              positive
                ? "bg-primary/15 text-primary"
                : "bg-destructive/10 text-destructive",
            )}
          >
            {positive ? <Check className="size-3" /> : <X className="size-3" />}
          </span>
          <span
            className={
              positive ? "text-foreground/90" : "text-muted-foreground"
            }
          >
            {item}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ComparisonSection() {
  return (
    <LandingSection id="compare">
      <Reveal>
        <SectionHeader
          align="center"
          badge="The difference"
          description="Most smart home hubs treat your house like a data source. Nemu treats it like yours."
          title="Cloud hubs weren't built for privacy"
        />
      </Reveal>

      <div className="grid gap-6 lg:grid-cols-2">
        <Reveal delay={0.05}>
          <div className="relative h-full overflow-hidden rounded-2xl border border-border bg-card/40 p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium text-muted-foreground text-xs uppercase tracking-widest">
                  Typical cloud hub
                </p>
                <h3 className="mt-2 font-bold font-heading text-2xl text-foreground">
                  Someone else&apos;s cloud
                </h3>
              </div>
              <Image
                alt="Nemu reacting to cloud dependency"
                className="size-20 shrink-0 drop-shadow-md sm:size-24"
                height={120}
                src="/not-like-this.png"
                width={120}
              />
            </div>
            <PointList items={cloudPoints} positive={false} />
          </div>
        </Reveal>

        <Reveal delay={0.12}>
          <div className="relative h-full overflow-hidden rounded-2xl border border-primary/25 bg-card/60 p-6 shadow-[0_0_48px_oklch(0.78_0.14_220_/8%)] sm:p-8">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,oklch(0.78_0.14_220_/12%),transparent_55%)]"
            />
            <div className="relative flex items-start justify-between gap-4">
              <div>
                <p className="font-medium text-primary text-xs uppercase tracking-widest">
                  Nemu
                </p>
                <h3 className="mt-2 font-bold font-heading text-2xl text-foreground">
                  Your network, your controller
                </h3>
              </div>
              <Image
                alt="Nemu excited about local control"
                className="size-20 shrink-0 drop-shadow-[0_0_20px_oklch(0.78_0.14_220_/20%)] sm:size-24"
                height={120}
                src="/sparkle.png"
                width={120}
              />
            </div>
            <PointList items={nemuPoints} positive />
          </div>
        </Reveal>
      </div>
    </LandingSection>
  );
}
