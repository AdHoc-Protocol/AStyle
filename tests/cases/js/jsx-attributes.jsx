export const List = ({items}) => (
<ul>
{items.map(item => (
<li key={item.id}
onClick={() => select(item)}>
{item.name}
</li>
))}
</ul>
);
<form
onSubmit={f}
>
<Button
label="ok"
/>
</form>
