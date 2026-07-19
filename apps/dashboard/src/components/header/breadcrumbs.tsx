"use client";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@nemu/ui/components/breadcrumb";
import { usePathname } from "next/navigation";
import { Fragment, useMemo } from "react";

function titleCase(segment: string) {
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

export function DashboardBreadcrumbs() {
  const pathname = usePathname();
  const segments = useMemo(
    () => pathname.split("/").filter(Boolean),
    [pathname],
  );

  if (segments.length === 0) {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>Home</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="/">Home</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        {segments.map((segment, index) => (
          <Fragment key={segment}>
            <BreadcrumbItem>
              {index === segments.length - 1 ? (
                <BreadcrumbPage>{titleCase(segment)}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink
                  href={`/${segments.slice(0, index + 1).join("/")}`}
                >
                  {titleCase(segment)}
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>

            {index < segments.length - 1 && <BreadcrumbSeparator />}
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
