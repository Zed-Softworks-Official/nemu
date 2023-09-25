'use client'

import React from 'react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import classNames from '@/helpers/classnames';

import { BuildingStorefrontIcon, Cog6ToothIcon, CurrencyDollarIcon, EnvelopeIcon, HomeIcon, PaintBrushIcon, PhotoIcon } from '@heroicons/react/20/solid';

export default function Navbar() {
    let pathname = usePathname();

    return (
        <aside className='absolute h-full top-0 w-80 z-0 backdrop-blur-xl bg-fullwhite/60 dark:bg-fullblack/60'>
            <div className='mt-10'>
                <Link href={'/'}>
                    <h1 className='text-center'>
                        Nemu
                    </h1>
                </Link>
            </div>
            <hr className='seperation' />
            <div className='ml-[20%]'>
                <div className='my-10'>
                    <Link href={'/dashboard'} className={classNames(pathname == '/dashboard' ? 'bg-primary text-white' : 'hover:bg-primary/60', 'p-4 px-10 rounded-3xl')}>
                        <HomeIcon className='sidenav-icon' />
                        <h3 className='inline mt-6 align-top text-lg font-bold'>Home</h3>
                    </Link>
                </div>
                <div className='my-10'>
                    <Link href={'/commissions'} className={classNames(pathname.includes('commissions') ? 'bg-primary text-white' : 'hover:bg-primary/60', 'p-4 px-10 rounded-3xl')}>
                        <PaintBrushIcon className='sidenav-icon' />
                        <h3 className='inline mt-6 align-top text-lg font-bold'>Commissions</h3>
                    </Link>
                </div>
                <div className='my-10'>
                    <Link href={'/dashboard'} className={classNames(pathname.includes('shop') ? 'bg-primary text-white' : 'hover:bg-primary/60', 'p-4 px-10 rounded-3xl')}>
                        <BuildingStorefrontIcon className='sidenav-icon' />
                        <h3 className='inline mt-6 align-top text-lg font-bold'>Shop</h3>
                    </Link>
                </div>
                <div className='my-10'>
                    <Link href={'/dashboard/portfolio'} className={classNames(pathname.includes('portfolio') ? 'bg-primary text-white' : 'hover:bg-primary/60', 'p-4 px-10 rounded-3xl')}>
                        <PhotoIcon className='sidenav-icon' />
                        <h3 className='inline mt-6 align-top text-lg font-bold'>Portfolio</h3>
                    </Link>
                </div>
            </div>
            <hr className='seperation' />
            <div className='ml-[20%]'>
                <div className='my-10'>
                    <Link href={'/dashboard'} className='p-4 px-10 hover:bg-primary/60 rounded-3xl'>
                        <CurrencyDollarIcon className='sidenav-icon' />
                        <h3 className='inline mt-6 align-top text-lg font-bold'>Income</h3>
                    </Link>
                </div>
                <div className='my-10'>
                    <Link href={'/dashboard/messages'} className={classNames(pathname.includes('messages') ? 'bg-primary text-white' : 'hover:bg-primary/60', 'p-4 px-10 rounded-3xl')}>
                        <EnvelopeIcon className='sidenav-icon' />
                        <h3 className='inline mt-6 align-top text-lg font-bold'>Messages</h3>
                    </Link>
                </div>
                <div className='my-10'>
                    <Link href={'/dashboard/settings'} className={classNames(pathname.includes('settings') ? 'bg-primary text-white' : 'hover:bg-primary/60', 'p-4 px-10 rounded-3xl')}>
                        <Cog6ToothIcon className='sidenav-icon' />
                        <h3 className='inline mt-6 align-top text-lg font-bold'>Settings</h3>
                    </Link>
                </div>
            </div>


        </aside>
    )
}