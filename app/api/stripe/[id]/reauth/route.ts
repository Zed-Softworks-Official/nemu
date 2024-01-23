import { StripeCreateAccountLink } from "@/core/payments";
import { NextResponse } from "next/server";

/**
 * Creates a new onboarding link for the stripe id
 */
export async function GET(req: Request, { params }: { params: { stripe_id: string }}) {
    return NextResponse.redirect((await StripeCreateAccountLink(params.stripe_id)).url);
}