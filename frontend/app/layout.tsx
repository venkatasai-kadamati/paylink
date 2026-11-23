import type { Metadata } from 'next';
import { IBM_Plex_Sans } from 'next/font/google';
import './globals.css';
import './workspace.css';

const sans = IBM_Plex_Sans({subsets:['latin'],variable:'--font-sans'});
export const metadata: Metadata = { title: 'PayLink — simulated payments', description: 'Send simulated payments and manage personal and joint accounts. No real money moves.' };
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en" className={sans.variable}><body>{children}</body></html>}
