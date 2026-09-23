// cstokens: compares the C# token streams of source files before and after formatting.
//
//   cstokens <listfile>
//
// Each line of the list file is "<original>\t<formatted>". For each pair with a
// different token stream a line "<original>\t<index>\t<expected>\t<actual>" is written.
// Whitespace, comments and the indentation of raw string literals are not compared.
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;

static List<string> Tokens(string text, out int errors)
{
    var tree = CSharpSyntaxTree.ParseText(text, new CSharpParseOptions(LanguageVersion.Preview));
    errors = tree.GetDiagnostics().Count(d => d.Severity == DiagnosticSeverity.Error);
    var list = new List<string>();
    foreach (var token in tree.GetRoot().DescendantTokens())
    {
        if (token.IsKind(SyntaxKind.EndOfFileToken))
            continue;
        list.Add(token.Kind() + ":" + token.ValueText);
    }
    return list;
}

int differences = 0;
foreach (var line in File.ReadAllLines(args[0]))
{
    var parts = line.Split('\t');
    if (parts.Length < 2)
        continue;
    var a = Tokens(File.ReadAllText(parts[0]), out int errorsA);
    var b = Tokens(File.ReadAllText(parts[1]), out int errorsB);
    if (errorsA > 0)
        continue;   // the original does not parse
    int n = Math.Min(a.Count, b.Count);
    int i = 0;
    while (i < n && a[i] == b[i])
        i++;
    if (i < a.Count || i < b.Count)
    {
        Console.WriteLine($"{parts[0]}\t{i}\t{(i < a.Count ? a[i] : "<end>")}\t{(i < b.Count ? b[i] : "<end>")}");
        differences++;
    }
    else if (errorsB > 0)
    {
        Console.WriteLine($"{parts[0]}\t-1\tno errors\t{errorsB} errors");
        differences++;
    }
}
return differences == 0 ? 0 : 1;
