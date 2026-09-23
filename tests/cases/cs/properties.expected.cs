public class Props
{
    public int A { get; set; }
    public int B { get; private set; } = 5;
    public string C { get; init; }
    public int D { get => _d; set => _d = value; }
    public int E {
        get { return _e; }
        set { _e = value; }
    }
    public int F {
        get { return _f; }
        set {
            _f = value;
            Changed();
        }
    }
    public int this[int i] {
        get { return _items[i]; }
    }
    public event EventHandler Changed {
        add { _h += value; }
        remove { _h -= value; }
    }
    public required string Name { get; internal set; }
    private int init = 0;
    void M() {
        init = init + 1;
        var record = GetRecord();
        record.Save();
    }
}
