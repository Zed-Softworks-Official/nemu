import React from "react";

import { PrismaClient } from "@prisma/client";
import { AWSLocations, S3GetSignedURL } from "@/helpers/s3";
import { PortfolioItem } from "@/helpers/portfolio";

export default async function Portfolio({ handle, id }: { handle: string, id: string }) {
    let prisma = new PrismaClient();

    let portfolio = await prisma.portfolio.findMany({
        where: {
            auth0id: id
        }
    });

    let items: PortfolioItem[] = [];
    for (let i = 0; i < portfolio.length; i++) {
        let url = await S3GetSignedURL(handle, AWSLocations.Portfolio, portfolio[i].image);
        items.push({
            signed_url: url,
            name: portfolio[i].name
        });
    }

    return (
    <div className="columns-1 md:columns-2 lg:columns-3 xl:columns-4">
        {items.map((item: PortfolioItem) => {
        (
            <div className="w-fit h-fit m-5">
                <img src={item.signed_url} alt={item.name} className="rounded-3xl" />
            </div>
        )
        })}
    </div>)
}