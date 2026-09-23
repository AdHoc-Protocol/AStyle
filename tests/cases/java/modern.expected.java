package com.example;

import java.util.List;
import java.util.function.Function;

public record Point(int x, int y) {
    public Point {
        if (x < 0) {
            throw new IllegalArgumentException("x");
        }
    }
}

sealed interface Shape permits Circle, Square {
}

class Demo {
    static String describe(Object o) {
        return switch (o) {
            case Integer i when i > 10 -> "big";
            case Integer i -> "int " + i;
            case String s -> {
                String t = s.trim();
                yield t;
            }
            default -> "other";
        };
    }

    void run(List<String> items) {
        switch (items.size()) {
            case 0 -> System.out.println("empty");
            case 1 -> {
                System.out.println("one");
            }
            default -> System.out.println("many");
        }
        items.forEach(item -> {
            System.out.println(item);
        });
        Function<Integer, Integer> twice = n -> n * 2;
        String json = """
            {
                "name": "demo"
            }
            """;
        var total = items.stream()
            .filter(s -> !s.isEmpty())
            .count();
        if (o instanceof Point(int x, int y)) {
            System.out.println(x + y);
        }
    }
}
