export type Pattern={kind:string;rank:number;size:number;chain:number;label:string};
export const rank=(c:number)=>c<52?Math.floor(c/4)+3:c-36;
export const rankLabel=(r:number)=>({11:'J',12:'Q',13:'K',14:'A',15:'2',16:'小王',17:'大王'}[r]||String(r));
export const cardLabel=(c:number)=>c>=52?rankLabel(rank(c)):['♣','♦','♥','♠'][c%4]+rankLabel(rank(c));
export const sortCards=(cards:number[])=>[...cards].sort((a,b)=>rank(b)-rank(a)||b-a);
const consecutive=(rs:number[])=>rs.length>0&&rs[rs.length-1]<=14&&rs.every((r,i)=>!i||r===rs[i-1]+1);
export function classify(cards:number[]):Pattern|null {
 if(!cards.length||cards.length>20||new Set(cards).size!==cards.length||cards.some(c=>!Number.isInteger(c)||c<0||c>53))return null;
 const counts=new Map<number,number>();cards.forEach(c=>counts.set(rank(c),(counts.get(rank(c))||0)+1));
 const rs=[...counts.keys()].sort((a,b)=>a-b),n=cards.length,cs=[...counts.values()];
 const p=(kind:string,r:number,label:string,chain=1):Pattern=>({kind,rank:r,size:n,chain,label});
 if(n===1)return p('single',rs[0],'单张');
 if(n===2&&rs[0]===16&&rs[1]===17)return p('rocket',17,'火箭');
 if(rs.length===1){if(n===2)return p('pair',rs[0],'对子');if(n===3)return p('triple',rs[0],'三张');if(n===4)return p('bomb',rs[0],'炸弹');}
 if(n===4&&cs.includes(3))return p('triple-single',rs.find(r=>counts.get(r)===3)!,'三带一');
 if(n===5&&cs.includes(3)&&cs.includes(2))return p('triple-pair',rs.find(r=>counts.get(r)===3)!,'三带二');
 if(n>=5&&cs.every(c=>c===1)&&consecutive(rs))return p('straight',rs[rs.length-1],'顺子',n);
 if(n>=6&&n%2===0&&cs.every(c=>c===2)&&consecutive(rs))return p('pairs',rs[rs.length-1],'连对',n/2);
 if(n>=6&&n%3===0&&cs.every(c=>c===3)&&consecutive(rs))return p('triples',rs[rs.length-1],'三顺',n/3);
 if(n===6&&cs.includes(4)){const rest=rs.filter(r=>counts.get(r)!==4);if(!(rest.includes(16)&&rest.includes(17)))return p('four-single',rs.find(r=>counts.get(r)===4)!,'四带两单');}
 if(n===8&&cs.filter(c=>c===4).length===1&&cs.filter(c=>c===2).length===2)return p('four-pair',rs.find(r=>counts.get(r)===4)!,'四带两对');
 // Wings cannot contain the fourth card of a body rank, a bomb, or both jokers.
 for(const wing of [1,2]){const k=n/(3+wing);if(!Number.isInteger(k)||k<2)continue;
  for(let start=3;start+k-1<=14;start++){const body=Array.from({length:k},(_,i)=>start+i);if(!body.every(r=>counts.get(r)===3))continue;
   const rest=rs.filter(r=>!body.includes(r));if(rest.includes(16)&&rest.includes(17))continue;
   if(wing===1&&rest.every(r=>counts.get(r)!<4)&&rest.reduce((s,r)=>s+counts.get(r)!,0)===k)return p('plane-single',start+k-1,'飞机带单',k);
   if(wing===2&&rest.length===k&&rest.every(r=>counts.get(r)===2))return p('plane-pair',start+k-1,'飞机带对',k);
  }
 }
 return null;
}
export function beats(p:Pattern,previous:Pattern|null){if(!previous)return true;if(previous.kind==='rocket')return false;if(p.kind==='rocket')return true;if(p.kind==='bomb'&&previous.kind!=='bomb')return true;return p.kind===previous.kind&&p.size===previous.size&&p.chain===previous.chain&&p.rank>previous.rank;}
export function legalMoves(hand:number[],previous:Pattern|null):number[][] {
 const groups=new Map<number,number[]>();[...hand].sort((a,b)=>rank(a)-rank(b)||a-b).forEach(c=>groups.set(rank(c),[...(groups.get(rank(c))||[]),c]));
 const moves:number[][]=[],seen=new Set<string>();
 const add=(cs:number[])=>{const p=classify(cs);if(p&&beats(p,previous)){const key=[...cs].sort((a,b)=>a-b).join(',');if(!seen.has(key)){seen.add(key);moves.push(cs);}}};
 for(const g of groups.values()){for(let n=1;n<=g.length;n++)add(g.slice(0,n));if(g.length>=3)for(const h of groups.values())if(h!==g){add([...g.slice(0,3),h[0]]);if(h.length>=2)add([...g.slice(0,3),...h.slice(0,2)]);}if(g.length===4){const rest=[...groups.values()].filter(h=>h!==g);for(let a=0;a<rest.length;a++)for(let b=a;b<rest.length;b++){if(a===b&&rest[a].length<2)continue;add([...g,rest[a][0],rest[b][a===b?1:0]]);if(a!==b&&rest[a].length>=2&&rest[b].length>=2)add([...g,...rest[a].slice(0,2),...rest[b].slice(0,2)]);}}}
 if(groups.has(16)&&groups.has(17))add([52,53]);
 for(const count of [1,2,3])for(let start=3;start<=14;start++){const body:number[]=[];for(let end=start;end<=14;end++){const g=groups.get(end);if(!g||g.length<count)break;body.push(...g.slice(0,count));const len=end-start+1;if(len<(count===1?5:count===2?3:2))continue;add([...body]);if(count===3){const rest=[...groups.entries()].filter(([r])=>r<start||r>end);const singles=rest.flatMap(([,g])=>g.slice(0,Math.min(3,g.length)));if(singles.length>=len)add([...body,...singles.slice(0,len)]);const pairs=rest.filter(([,g])=>g.length>=2);if(pairs.length>=len)add([...body,...pairs.slice(0,len).flatMap(([,g])=>g.slice(0,2))]);}}}
 return moves.sort((a,b)=>{const x=classify(a)!,y=classify(b)!;const bomb=(p:Pattern)=>p.kind==='rocket'?2:p.kind==='bomb'?1:0;return bomb(x)-bomb(y)||(previous?x.rank-y.rank:b.length-a.length)||x.rank-y.rank;});
}
export function shuffle(){const deck=Array.from({length:54},(_,i)=>i);for(let i=53;i>0;i--){const range=i+1,limit=Math.floor(4294967296/range)*range;let r;do{r=crypto.getRandomValues(new Uint32Array(1))[0];}while(r>=limit);const j=r%range;[deck[i],deck[j]]=[deck[j],deck[i]];}return deck;}
