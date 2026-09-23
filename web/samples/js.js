import { fetchJson } from './api.js';

const cache=new Map();

export async function loadUser(id,{force=false}={}){
if(!force&&cache.has(id)) return cache.get(id);
const user=await fetchJson(`/users/${id}`);
cache.set(id,user);
return user;
}

export class Store {
constructor(initial){
this.state={...initial};
this.listeners=[];
}
subscribe(fn){this.listeners.push(fn);return ()=>{this.listeners=this.listeners.filter(l=>l!==fn)}}
dispatch(action){
switch(action.type){
case 'add':
this.state={...this.state,items:[...this.state.items,action.item]};
break;
case 'clear': this.state={...this.state,items:[]}; break;
default:
return
}
this.listeners.forEach(l=>l(this.state))
}
}

const total=items=>items
.filter(i=>i.price>0)
.reduce((sum,i)=>sum+i.price*i.count,0)

if(total([])===0&&cache.size>10||cache.size>100&&typeof window!=='undefined'){console.log('large cache')}
else if (cache.size === 0)
{
console.log(/^user-\d+$/.test('user-1')?'match':'no')
}
