import RoomClient from './room-client';
import {readRoom} from '@/lib/store';
import type {Metadata} from 'next';
type Props={params:Promise<{code:string}>};
export async function generateMetadata({params}:Props):Promise<Metadata>{const {code}=await params;let title='比赛房间';try{title=(await readRoom(code.toUpperCase()))?.room.title||title;}catch{}const description=`加入「${title}」，在牌局与好友在线比赛。`;return {title:title+' · 牌局',description,openGraph:{title,description,images:[]},twitter:{card:'summary',title,description,images:[]},robots:{index:false,follow:false}};}
export default async function Page({params}:Props){return <RoomClient code={(await params).code.toUpperCase()}/>;}
