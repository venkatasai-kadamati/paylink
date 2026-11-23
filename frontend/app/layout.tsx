import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'PayLink — simulated payments', description: 'Send simulated payments and manage personal and joint accounts. No real money moves.' };
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en"><body>{children}</body></html>}
