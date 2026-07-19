"use client";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@nemu/ui/components/sidebar";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback } from "react";
import { navigation } from "~/lib/navigation";

export function NavMain() {
  const pathname = usePathname();
  const isActive = useCallback(
    (href: string) => {
      return pathname === href;
    },
    [pathname],
  );

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          {navigation.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton asChild isActive={isActive(item.href)}>
                <Link href={item.href}>
                  <item.icon className="size-4" />
                  {item.label}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
