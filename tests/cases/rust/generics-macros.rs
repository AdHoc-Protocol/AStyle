fn process<
T: Clone + Send,
U: Into<String>,
>(items: Vec<T>, name: U) -> Result<
HashMap<String, T>,
Error,
> {
let v = vec![
1,
2,
];
println!(
"{} {}",
a, b
);
let s = format!("{}", x);
assert_eq!(
compute(1),
2
);
Ok(map)
}

macro_rules! square {
($x:expr) => {
$x * $x
};
($x:expr, $y:expr) => {{
let a = $x;
a * $y
}};
}

struct Wrapper<
'a,
T: Debug,
> {
inner: &'a T,
}
