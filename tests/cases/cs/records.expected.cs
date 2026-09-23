namespace Demo;
public record Person(string Name, int Age);
public record struct Point(int X, int Y) {
    public int Sum => X + Y;
}
public sealed record class Box<T>(T Value) where T : notnull
{
    public Box<T> With(T v) => this with { Value = v };
}
