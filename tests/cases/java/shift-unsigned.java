class Shifts
{
    static int trailing8Zeros(int i)
    {
        int n = 7;
        int y = i << 4;
        y = i << 2;
        return y == 0 ? n - ( i << 1 >>> 31 ) : n - 2 - ( y << 1 >>> 31 );
    }

    static int mix(int i, int y)
    {
        int a = (i << 1) + (y << 1 >>> 31);
        f(i << 1, y << 1 >>> 31);
        java.util.Map<String, java.util.List<Integer>> m = null;
        return a >>> 1;
    }
}
