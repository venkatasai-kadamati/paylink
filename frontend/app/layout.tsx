import type { Metadata } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const sans = IBM_Plex_Sans({subsets:['latin'],variable:'--font-sans'});
const figures = IBM_Plex_Mono({weight:['400','500'],subsets:['latin'],variable:'--font-figures'});
export const metadata: Metadata = { title: 'PayLink — simulated payments', description: 'Send simulated payments and manage personal and joint accounts. No real money moves.' };
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en" className={`${sans.variable} ${figures.variable}`}><body>{children}</body></html>}
