export const Form = () => {
const el = <span>
don't {"stop"}
</span>;
return (
<form
onSubmit={(e) => {
e.preventDefault();
save();
}}
className={`form ${
active ? "on" : "off"
}`}
>
{/* a comment */}
{open ? (
<Dialog<string> title="t" />
) : (
<>
<Button
label="ok"
/>
</>
)}
</form>
);
};
