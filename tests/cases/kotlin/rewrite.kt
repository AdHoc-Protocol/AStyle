import kotlin.math.max
import java.io.File

class User(
    val id: Int,
    val displayName: String
) {
    override public val name: String = "a"
    var total = 0L // sum
    private val cache: Map<String, Int> = mapOf()
}

fun f(
    a: Int,
    b: Int
) = listOf(
    a,
    b
)
