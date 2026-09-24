import java.io.File
import kotlin.math.max

class User(
    val id:          Int,
    val displayName: String,
) {
    public override val name:  String           = "a"
    var                 total                   = 0L // sum
    private val         cache: Map<String, Int> = mapOf()
}

fun f(
    a: Int,
    b: Int,
) = listOf(
    a,
    b,
)
