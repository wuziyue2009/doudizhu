import assert from 'node:assert/strict';
const base=process.env.TEST_URL||'http://localhost:3000';
let cookie='';
async function call(path,body){const response=await fetch(base+path,{method:body?'POST':'GET',headers:{...(cookie?{cookie}:{}),...(body?{'Content-Type':'application/json',Origin:base}:{})},body:body?JSON.stringify(body):undefined});const set=response.headers.get('set-cookie');if(set)cookie=set.split(';')[0];return {status:response.status,data:await response.json()};}
const created=await call('/api/rooms',{name:'配置验证',title:'逐局与共享用时验证',mode:'team',rounds:3,boards:2,roundBoards:[1,3,2],teamMinutes:1,seconds:120,format:'best'});assert.equal(created.status,201);
const path='/api/rooms/'+created.data.code;
let v=(await call(path)).data;assert.deepEqual(v.settings.roundBoards,[1,3,2]);assert.equal(v.settings.teamMinutes,1);
assert.equal((await call(path,{type:'settings',settings:{roundBoards:[1]}})).status,400);
v=(await call(path,{type:'settings',settings:{roundBoards:[2,3,4],teamMinutes:2}})).data;assert.deepEqual(v.settings.roundBoards,[2,3,4]);assert.equal(v.settings.teamMinutes,2);
await call(path,{type:'bots'});v=(await call(path,{type:'start'})).data;assert.equal(v.status,'playing');assert.equal(v.plannedBoards,2);assert.deepEqual(v.teamClock.remaining,[120000,120000]);assert.equal(v.rating,null);
const later=(await call(path)).data;assert.ok(later.teamClock.remaining.every(n=>n>110000&&n<=120000));assert.deepEqual(later.settings.roundBoards,[2,3,4]);assert.equal(later.me,v.me);
console.log('PASS API: custom round schedule, invalid schedule rejection, editable team budget, starting clock, persisted configuration and private identity.');
