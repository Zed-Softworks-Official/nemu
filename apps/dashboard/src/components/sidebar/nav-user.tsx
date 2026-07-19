import { currentUser } from "@clerk/nextjs/server";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@nemu/ui/components/avatar";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@nemu/ui/components/sidebar";
import { Skeleton } from "@nemu/ui/components/skeleton";
import { EllipsisVertical } from "lucide-react";
import { SidebarUserButton } from "./user-button";

export async function NavUser() {
  const user = await currentUser();
  if (!user) return <NavUserSkeleton />;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarUserButton>
          <Avatar className="size-8 rounded-lg">
            <AvatarImage src={user.imageUrl} />
            <AvatarFallback>{user.firstName?.charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">{user.fullName}</span>
            <span className="truncate text-muted-foreground">
              {user.emailAddresses[0]?.emailAddress}
            </span>
          </div>
          <EllipsisVertical className="ml-auto size-4" />
        </SidebarUserButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function NavUserSkeleton() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size={"lg"}>
          <Avatar className="size-8 rounded-lg">
            <AvatarFallback>
              <Skeleton className="size-8 rounded-lg" />
            </AvatarFallback>
          </Avatar>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-24" />
          </div>
          <EllipsisVertical className="ml-auto size-4" />
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
