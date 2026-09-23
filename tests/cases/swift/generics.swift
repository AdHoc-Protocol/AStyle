func merge<
A: Sequence,
B: Sequence
>(_ a: A, _ b: B) -> [A.Element] where A.Element == B.Element {
return Array(a) + Array(b)
}
