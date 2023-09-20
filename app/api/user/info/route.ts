import prisma from "@/prisma/prisma";
import { NextResponse, NextRequest } from "next/server";

type ResponseData = {
    message: string
}

export function GET(req: NextRequest, res: NextResponse) {
    NextResponse.json({message: "Hello, World!"});
}