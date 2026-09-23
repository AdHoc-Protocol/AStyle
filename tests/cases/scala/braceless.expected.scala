package example

import scala.collection.mutable.{ArrayBuffer, ListBuffer}
import scala.util.*

enum Color(val rgb: Int):
    case Red extends Color(0xFF0000)
    case Green extends Color(0x00FF00)

    def hex: String = f"#$rgb%06X"

trait Shape:
    def area: Double

case class Circle(r: Double) extends Shape:
    def area: Double = math.Pi * r * r

object Geometry:
    given Ordering[Shape] with
        def compare(a: Shape, b: Shape): Int =
            a.area.compare(b.area)

    extension (s: Shape)
        def isLarge: Boolean = s.area > 100
        def describe: String =
            s match
                case Circle(r) if r > 10 =>
                    s"a large circle of radius $r"
                case c: Circle =>
                    s"a circle, ${c.r}"
                case _ => "a shape"

    def classify(n: Int): String =
        if n < 0 then
            "negative"
        else if n == 0 then "zero"
        else
            val big = n > 1000
            if big then "big" else "positive"

    def sum(xs: List[Int]): Int =
        var total = 0
        var i = 0
        while i < xs.length do
            total += xs(i)
            i += 1
        end while
        total

    def pairs(n: Int): List[(Int, Int)] =
        for
            a <- (1 to n).toList
            b <- (a to n).toList
            if (a + b) % 2 == 0
        yield (a, b)

    def safeDiv(a: Int, b: Int): Option[Int] =
        try
            Some(a / b)
        catch
            case _: ArithmeticException => None
        finally
            println("done")

    def render(items: List[String])(using ctx: Context): String =
        items
            .filter(_.nonEmpty)
            .map: item =>
                val trimmed = item.trim
                s"<li>$trimmed</li>"
            .mkString("\n")

    def valid(a: Int, b: Int): Boolean =
        a > 0
            && b > 0
            && a != b
end Geometry
