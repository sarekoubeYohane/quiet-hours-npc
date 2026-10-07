import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Quiet Hours · NPC 觀察室',description:'觀察 NPC 自己生活，介入事件，追蹤各自的記憶。',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-Hant" className="dark"><body>{children}</body></html>;}
