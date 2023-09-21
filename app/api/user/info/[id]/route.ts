import { NextResponse, NextRequest } from "next/server";

export function GET(req: NextRequest, res: NextResponse) {
    return NextResponse.json({message: "Hello, World!"});
}