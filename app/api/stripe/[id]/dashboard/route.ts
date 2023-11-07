import { StripeCreateLoginLink } from "@/helpers/stripe";
import { NextResponse } from "next/server";

/**
 * Creates Stripe Dashboard URL for the Current User
 */
export async function GET(req: Request, { params }: { params: { id: string }}) {
    return NextResponse.json({
        dashboard_url: (await StripeCreateLoginLink(params.id)).url
    });
}