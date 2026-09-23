import React, { useEffect, useState } from 'react';

export default function App({ items, onSelect }) {
const [value, setValue] = useState('');
useEffect(() => {
const id = setInterval(() => {
setValue(v => v + 1);
}, 1000);
return () => clearInterval(id);
}, []);
const handle = useCallback((e) => {
onSelect(e.target.value);
}, [onSelect]);
return (
<div className="app" onClick={() => {
handle(1);
}}>
{items.map(item => (
<Item key={item.id} {...item} />
))}
</div>
);
}
app.get('/api', async (req, res) => {
try {
const data = await db.query({
table: 'users',
where: { id: req.params.id },
});
res.json(data);
} catch (err) {
next(err);
}
});
