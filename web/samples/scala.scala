package example

import scala.collection.mutable.ListBuffer

enum Shape:
  case Circle(r:Double)
  case Rect(w:Double,h:Double)

object Shapes:
  extension (s:Shape)
    def area:Double = s match
      case Shape.Circle(r) => math.Pi*r*r
      case Shape.Rect(w,h) => w*h

  def describe(s:Shape):String =
    if s.area>100 then
      "large"
    else if s.area==0 then "empty"
    else
      val rounded = math.round(s.area)
      s"small, $rounded"

  def total(shapes:List[Shape]):Double =
    shapes
      .filter(_.area>0)
      .map: s =>
        val a = s.area
        a*1.1
      .sum
end Shapes

class Registry(name:String) {
private val items = ListBuffer[String]()
def add(item:String):Unit = {
if (item.nonEmpty) {
items += item
} else {
println(s"skip in $name")
}
}
def find(p:String=>Boolean):Option[String] = items.find(p)
}
