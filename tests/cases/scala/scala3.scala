object Geometry:
  val unit: Double = 1.0
  val name = "geometry"

  def sign(x: Int): String =
    if (x > 0) "positive"
    else if (x < 0) "negative"
    else "zero"

  def sum(xs: List[Int]): Int =
    var total = 0
    for (x <- xs) total += x
    total
