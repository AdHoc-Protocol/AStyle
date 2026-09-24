import java.util.Map;
import static java.lang.Math.max;
import java.io.File;

public class Account {
    final private static int MAX = 10; // limit
    private String name = "a b"; // name
    protected long total;
    private Map<String, Integer> cache = new HashMap<>();

    synchronized public void add(int n) {
        int count = n;
        total += n;
        name = "x";
        String message = "total = " + total; // text
    }
}
