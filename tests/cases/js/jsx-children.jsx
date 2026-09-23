function App({ items }) {
return (
<div className="app">
<Header title="x" />
{items.map((item) => (
<Item key={item.id} {...item}>
{item.label}
</Item>
))}
{loading && <Spinner />}
<p>
text with {value}
</p>
</div>
);
}
