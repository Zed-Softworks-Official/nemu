import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export default clerkMiddleware((_auth, request) => {
    const host = request.headers.get("host")?.split(":")[0]?.toLowerCase();
    if (host === "get.nemu.sh" && request.nextUrl.pathname === "/") {
        // App Router `/` wins over vercel.json afterFiles rewrites; rewrite here.
        return NextResponse.rewrite(new URL("/install.sh", request.url));
    }
});

export const config = {
    matcher: [
        // Skip Next.js internals and all static files, unless found in search params
        "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
        // Always run for API routes
        "/(api|trpc)(.*)",
    ],
};
