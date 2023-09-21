import { NextResponse } from "next/server";

import { GetUser } from "@/helpers/auth0";

export async function GET(req: Request, { params }: { params: { id: string }}) {
    return NextResponse.json({ username: (await GetUser(params.id)).username });
}