import React from "react";

import { PortfolioItem } from "@/helpers/api/request-inerfaces";

export default async function Portfolio({ handle, id }: { handle: string, id: string }) {
    let res = await fetch(`/api/artist/items/${handle}/portfolio/${id}`);
    let data = await res.json();

    return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
        {data.portfolio_items.map( (item: PortfolioItem) => {
        return (
            <div className="w-fit h-fit">
                <img src={item.signed_url} alt={item.name} className="rounded-3xl w-full" />
            </div>
        )
        })}
    </div>)
}