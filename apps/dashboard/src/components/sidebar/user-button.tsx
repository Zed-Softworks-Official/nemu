"use client";

import { useClerk } from "@clerk/nextjs";
import { SidebarMenuButton } from "@nemu/ui/components/sidebar";

export function SidebarUserButton(props: { children: React.ReactNode }) {
  const { openUserProfile } = useClerk();

  return (
    <SidebarMenuButton onClick={() => openUserProfile()} size="lg">
      {props.children}
    </SidebarMenuButton>
  );
}
