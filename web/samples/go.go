package main

import (
"fmt"
"strings"
)

type Shape interface {
Area() float64
}

type Rect struct {
W, H float64
}

func (r Rect) Area() float64 { return r.W*r.H }

var tests = []struct {
name string
want float64
}{{
name: "square",
want: 4,
}, {
name: "rect",
want: 6,
}}

func describe(shapes []Shape) (string, error) {
var b strings.Builder
for i, s := range shapes {
switch v := s.(type) {
case Rect:
fmt.Fprintf(&b, "%d: rect %v\n", i, v.Area())
default:
return "", fmt.Errorf("unknown shape %T", v)
}
}
if b.Len() == 0 {
return "", nil
} else if b.Len() > 1000 {
return b.String()[:1000], nil
}
return b.String(), nil
}

func main() {
out, err := describe([]Shape{Rect{W: 2, H: 3}})
if err != nil { panic(err) }
fmt.Println(out)
}
