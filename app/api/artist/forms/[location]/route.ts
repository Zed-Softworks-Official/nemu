import { NextResponse } from "next/server";

//////////////////////////////////////////
// POST Item To AWS API Route
//////////////////////////////////////////
export async function POST(req: Request, { params }: { params: {location: string} }) {
    const data = await req.formData();

    return NextResponse.json({
        title: data.get('title'),
        file: data.get('dropzone-file')
    });
}