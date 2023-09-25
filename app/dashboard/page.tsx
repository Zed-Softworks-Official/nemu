import React from "react";

import { getSession } from "@auth0/nextjs-auth0";

import prisma from "@/prisma/prisma";
import { useDashboardContext } from "@/components/Navigation/Dashboard/DashboardContext";


export default async function Dashboard() {
    return (
        <main className="flex flex-wrap py-14">
            <div className="dark:bg-fullblack bg-fullwhite p-10 mx-auto rounded-3xl">
                <h2>Dashboard</h2>
            </div>
        </main>
    )
}