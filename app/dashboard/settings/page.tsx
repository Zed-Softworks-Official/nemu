'use client'

import React from "react";
import ScrollSpy from 'react-ui-scrollspy';

export default function Settings() {
    const onPress = (event: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => {
        event.preventDefault();

        const target = window.document.getElementById(event.currentTarget.href.split('#')[1]);
        if (target) {
            target.scrollIntoView({ behavior: 'smooth'});
        }
    }

    return (
        <main className="py-14 justify-around mr-24 ml-[26rem]">
             <aside className="fixed dark:bg-fullblack bg-fullwhite p-10 rounded-3xl w-[30rem]">
                <div className="pb-10">
                    <h1 className="font-bold text-2xl text-center">Settings</h1>
                    <hr className="seperation" />
                    <div>
                        <a onClick={(event) => onPress(event)} href="#profile">
                            <p data-to-scrollspy-id="profile" className="p-5 hover:bg-primary/60 rounded-3xl">Profile</p>
                        </a>
                        <a onClick={(event) => onPress(event)} href="#commission">
                            <p data-to-scrollspy-id="commission" className="p-5 hover:bg-primary/60 rounded-3xl">Commission</p>
                        </a>
                    </div>
                </div>
            </aside>
            <ScrollSpy>
                <div id="profile" className="mb-10">
                    <div className="dark:bg-fullblack bg-fullwhite p-10 rounded-3xl ml-[32rem]">
                        <div className="pb-[200%]">
                            <h1 className="font-bold text-2xl text-center">Profile</h1>
                            <hr className="seperation" />
                        </div>
                    </div>
                </div>
                <div id="commission" className="mb-10">
                    <div className="dark:bg-fullblack bg-fullwhite p-10 rounded-3xl ml-[32rem] mb-10">
                        <div className="pb-[200%]">
                            <h1 className="font-bold text-2xl text-center">Commission</h1>
                            <hr className="seperation" />
                        </div>
                    </div>
                </div>
            </ScrollSpy>
        </main>
    )
}