import React,{useState,useEffect} from 'react';

export function TodoList({todos,onToggle}){
const [filter,setFilter]=useState('all');
useEffect(()=>{
document.title=`${todos.length} todos`;
},[todos]);
const visible=todos.filter(t=>filter==='all'||(filter==='done'?t.done:!t.done));
return (
<div className="todos">
<Header count={visible.length} onFilter={setFilter}/>
<ul>
{visible.map(todo=>(
<li key={todo.id}
className={todo.done?'done':''}
onClick={()=>{
onToggle(todo.id);
}}>
{todo.title}
</li>
))}
</ul>
{visible.length===0&&<p>Nothing to do</p>}
</div>
);
}
