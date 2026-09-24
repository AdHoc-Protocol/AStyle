object Geometry:
  val unit: Double = 1.0
  val name         = "geometry"

  def sign(x: Int): String =
    if x > 0 then "positive"
    else if x < 0 then "negative"
    else "zero"
  end sign

  def sum(xs: List[Int]): Int =
    var total = 0
    for x <- xs do total += x
    total
  end sum
end Geometry
