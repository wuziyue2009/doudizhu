import type { Metadata } from 'next';
import './globals.css';
const origin='https://doudizhu.wuziyue2009.chatgpt.site';
const title='牌局 · 好友竞技场';
const description='创建斗地主比赛。支持四对四复式团体赛、三人个人赛，自定义局数与牌数，邀请好友在线较量。';
export const metadata: Metadata = {metadataBase:new URL(origin),icons:{icon:"/favicon.svg"},title,description,openGraph:{title,description,url:origin,type:'website',locale:'zh_CN',images:[{url:origin+'/og.png',width:1730,height:909,alt:'牌局 · 好友竞技场'}]},twitter:{card:'summary_large_image',title,description,images:[origin+'/og.png']}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="zh-CN"><body>{children}</body></html>;}
