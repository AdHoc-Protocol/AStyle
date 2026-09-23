namespace Foo.Bar;

using System;

public record Person(string Name, int Age);
public record struct Point(int X, int Y) { public int Sum => X + Y; }

public class Service(ILogger logger) : IService where T : class, new()
{
private readonly ILogger _logger = logger;
public string Name { get; init; }
public required int Id { get; set; }
public int Count { get { return _count; } set { _count = value; } }

public string Describe(object o) => o switch
{
int i when i > 0 => $"positive {i}",
string { Length: > 3 } s => $"long {s}",
null => "null",
_ => "other"
};

public async Task RunAsync(CancellationToken ct = default)
{
await using var conn = new SqlConnection();
using var scope = logger.BeginScope("x");
var list = new List<int> { 1, 2, 3 };
int[] arr = [1, 2, 3];
var p = new Person("a", 1) with { Age = 2 };
if (o is not null and { Length: > 0 }) { Console.WriteLine($"{(o is string ? "s" : "n")} {x:N2}"); }
var raw = """
    hello "world"
    { not a brace
    """;
var json = $$"""{"a": {{x}}}""";
var v = @"c:\path\{";
var q = from c in customers
where c.Age > 10
select new { c.Name, c.Age };
Func<int, int> f = x => x * 2;
Action a = () => { Console.WriteLine("hi"); };
var obj = new Foo
{
A = 1,
B = new Bar { C = 2 }
};
x ??= new();
var y = z?.Length ?? 0;
switch (x)
{
case 1:
break;
case > 5 and < 10:
return;
}
}
[HttpGet("{id}")]
[return: NotNull]
public IActionResult Get(int id) { return Ok(); }
}
