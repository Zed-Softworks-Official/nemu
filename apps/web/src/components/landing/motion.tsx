"use client";

import type { HTMLMotionProps, Transition } from "motion/react";
import { animate, motion, useReducedMotion } from "motion/react";
import type { MouseEvent } from "react";
import { cn } from "@nemu/ui/lib/utils";

const easeOut = [0.22, 1, 0.36, 1] as const;

/** Fixed header (h-16) plus a little breathing room */
export const SECTION_SCROLL_OFFSET = 80;

export const revealTransition: Transition = {
  duration: 0.85,
  ease: easeOut,
};

export const sectionScrollTransition: Transition = {
  duration: 0.75,
  ease: easeOut,
};

export function scrollToSection(
  target: string,
  options?: { offset?: number; reducedMotion?: boolean | null },
) {
  const id = target.startsWith("#") ? target.slice(1) : target;
  const element = document.getElementById(id);
  if (!element) return Promise.resolve();

  const offset = options?.offset ?? SECTION_SCROLL_OFFSET;
  const top = element.getBoundingClientRect().top + window.scrollY - offset;
  const prefersReduced =
    options?.reducedMotion ??
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (prefersReduced) {
    window.scrollTo({ top, behavior: "auto" });
    return Promise.resolve();
  }

  return animate(window.scrollY, top, {
    ...sectionScrollTransition,
    onUpdate: (value) => window.scrollTo(0, value),
  });
}

export function useSectionScroll() {
  const reduceMotion = useReducedMotion();

  function scrollTo(href: string, onNavigate?: () => void) {
    if (!href.startsWith("#")) return;
    void scrollToSection(href, { reducedMotion: reduceMotion }).then(() =>
      onNavigate?.(),
    );
  }

  function onSectionClick(
    href: string,
    onNavigate?: () => void,
  ): ((event: MouseEvent<HTMLAnchorElement>) => void) | undefined {
    if (!href.startsWith("#")) return undefined;

    return (event) => {
      event.preventDefault();
      scrollTo(href, onNavigate);
    };
  }

  return { onSectionClick, scrollTo, scrollToSection };
}

export function Reveal({
  children,
  className,
  delay = 0,
  ...props
}: HTMLMotionProps<"div"> & { delay?: number }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
      transition={{ ...revealTransition, delay }}
      viewport={{ margin: "-60px", once: true }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function RevealOnMount({
  children,
  className,
  delay = 0,
  ...props
}: HTMLMotionProps<"div"> & { delay?: number }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      className={className}
      initial={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
      transition={{ ...revealTransition, delay }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function Float({
  children,
  className,
  delay = 0,
  ...props
}: HTMLMotionProps<"div"> & { delay?: number }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      animate={
        reduceMotion
          ? undefined
          : {
              y: [0, -10, 0],
              rotate: [-2, 2, -2],
            }
      }
      className={className}
      transition={
        reduceMotion
          ? undefined
          : {
              duration: 6,
              delay,
              ease: "easeInOut",
              repeat: Number.POSITIVE_INFINITY,
            }
      }
      {...props}
    >
      {children}
    </motion.div>
  );
}

type StarProps = {
  className?: string;
  delay?: number;
};

export function TwinkleStar({ className, delay = 0 }: StarProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.span
      animate={
        reduceMotion
          ? undefined
          : {
              opacity: [0.35, 0.9, 0.35],
              scale: [1, 1.15, 1],
            }
      }
      aria-hidden="true"
      className={cn("absolute rounded-full", className)}
      transition={
        reduceMotion
          ? undefined
          : {
              duration: 3.4,
              delay,
              ease: "easeInOut",
              repeat: Number.POSITIVE_INFINITY,
            }
      }
    />
  );
}

export function DriftOrb({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      animate={
        reduceMotion
          ? undefined
          : {
              x: ["0%", "-2%", "0%"],
              y: ["0%", "3%", "0%"],
              scale: [1, 1.06, 1],
            }
      }
      aria-hidden="true"
      className={className}
      transition={
        reduceMotion
          ? undefined
          : {
              duration: 18,
              ease: "easeInOut",
              repeat: Number.POSITIVE_INFINITY,
            }
      }
    />
  );
}
