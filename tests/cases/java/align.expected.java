import java.io.File;
import java.util.Map;
import static java.lang.Math.max;

public class Account {
    private static final int                  MAX   = 10;    // limit
    private              String               name  = "a b"; // name
    protected            long                 total;
    private              Map<String, Integer> cache = new HashMap<>();

    public synchronized void add(int n) {
        int count = n;
        total += n;
        name   = "x";
        String message = "total = " + total; // text
    }
}
