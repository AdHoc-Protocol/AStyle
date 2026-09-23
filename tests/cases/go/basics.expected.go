package main

import (
	"fmt"
	"strings"
)

type Point struct {
	X, Y int
	Name string `json:"name"`
}

type Shape interface {
	Area() float64
}

func (p *Point) Move(dx, dy int) error {
	if dx < 0 {
		return fmt.Errorf("neg %d", dx)
	} else if dy < 0 {
		return nil
	}
	for i := 0; i < 10; i++ {
		p.X += i
	}
	for _, v := range items {
		total += v
	}
	switch v := x.(type) {
	case int:
		fmt.Println("int")
	default:
		fmt.Println("other")
	}
	go func() {
		ch <- 1
	}()
	defer func() { recover() }()
	m := map[string]int{
		"a": 1,
		"b": 2,
	}
	select {
	case msg := <-ch:
		fmt.Println(msg)
	case <-done:
		return nil
	}
	if err := do(); err != nil {
		return err
	}
	s := strings.Join([]string{
		"a",
		"b",
	}, ",")
	return nil
}
