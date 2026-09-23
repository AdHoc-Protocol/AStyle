class A
{
    string D(object o) => o switch
    {
        int i when i > 0 => "positive",
        string { Length: > 3 } s => "long",
        Point { X: 0, Y: 0 } => "origin",
        _ => "other"
    };
    void F()
    {
        var r = o switch { A a => 1, _ => 2 };
        var t = (a, b) switch
        {
            (1, 2) => "x",
            _ => "y",
        };
        switch (x)
        {
        case 1:
            break;
        case > 5 and < 10:
            return;
        }
    }
}
