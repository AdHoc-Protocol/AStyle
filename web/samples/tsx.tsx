import { useMemo } from 'react';

type Props<T>={items:T[];render:(item:T)=>JSX.Element;empty?:string};

export function List<T extends {id:string}>({items,render,empty='No items'}:Props<T>){
const sorted=useMemo(()=>[...items].sort((a,b)=>a.id.localeCompare(b.id)),[items]);
if(sorted.length===0) return <p className="empty">{empty}</p>;
return (
<ul>
{sorted.map(item=>(
<li key={item.id}>
{render(item)}
</li>
))}
</ul>
);
}
