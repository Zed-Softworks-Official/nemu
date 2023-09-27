import { NextResponse } from "next/server";
import { GetUser } from "@/helpers/auth0";

//////////////////////////////////////////
// GET User Info API Route
//////////////////////////////////////////
export async function GET(req: Request, { params }: { params: { id: string }}) {
    return NextResponse.json({ user: (await GetUser(params.id)) });
}