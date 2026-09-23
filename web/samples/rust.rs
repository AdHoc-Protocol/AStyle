use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct Inventory<'a> {
items: HashMap<&'a str, u32>,
}

impl<'a> Inventory<'a> {
pub fn new() -> Self { Self { items: HashMap::new() } }

pub fn add(&mut self, name: &'a str, count: u32) -> Result<u32, String> {
if count == 0 {
return Err(format!("no {}", name));
} else if count > 1000 {
return Err("too many".to_string());
}
let total = self.items.entry(name).or_insert(0);
*total+=count;
Ok(*total)
}

fn describe(&self, name: &str) -> String {
match self.items.get(name) {
Some(0) | None => "none".to_string(),
Some(n) if *n > 100 => {
let s = format!("many {}", n);
s
}
Some(n) => n.to_string(),
}
}
}

fn process<
T: Clone + Send,
U: Into<String>,
>(items: Vec<T>, label: U) -> Vec<T> {
let evens: Vec<_> = (0..10).filter(|x| x % 2 == 0).map(|x| {
x * 2
}).collect();
items.iter().cloned().collect()
}

macro_rules! square {
($x:expr) => {{
let v = $x;
v * v
}};
}
