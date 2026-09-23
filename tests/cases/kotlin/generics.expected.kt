class Cache<
    K : Comparable<K>,
    V : Any,
>(private val size: Int) {
    fun get(key: K): V? = map[key]
}
