use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct Point<'a> {
    pub x: i32,
    name: &'a str,
}

impl<'a> Point<'a> {
    pub fn new(x: i32, name: &'a str) -> Self {
        Self { x, name }
    }

    fn describe(&self) -> String {
        match self.x {
            0 => "zero".to_string(),
            n if n < 0 => {
                let s = format!("neg {}", n);
                s
            }
            _ => format!("{} at {}", self.name, self.x),
        }
    }
}

pub trait Shape {
    fn area(&self) -> f64;
}

enum Msg {
    Quit,
    Move { x: i32, y: i32 },
    Write(String),
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut map: HashMap<String, Vec<u8>> = HashMap::new();
    for (k, v) in map.iter() {
        println!("{k}: {v:?}");
    }
    if let Some(x) = opt {
        x.run()?;
    } else if cond {
        return Ok(());
    }
    while let Some(item) = it.next() {
        total += item;
    }
    let v: Vec<_> = (0..10).filter(|x| x % 2 == 0).map(|x| {
        x * 2
    }).collect();
    'outer: loop {
        break 'outer;
    }
    let raw = r#"a "quoted" {brace}"#;
    let c = 'x';
    let closure = |a: i32, b: i32| -> i32 { a + b };
    Ok(())
}

mod tests {
    #[test]
    fn it_works() {
        assert_eq!(2 + 2, 4);
    }
}
