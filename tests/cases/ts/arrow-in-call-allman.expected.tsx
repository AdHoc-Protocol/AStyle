function P(props)
{
    const v: T = useMemo(() =>
    {
        function show()
        {
            set(1);
        }
        return { a: 1 };
    }, [state]);
}
