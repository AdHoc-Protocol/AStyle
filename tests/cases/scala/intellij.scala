package example

import scala.collection.mutable.{ ListBuffer, Map }
import scala.util.{Failure, Success}

object Report:
  val header = "report"
  val footer = "end"
  def lines(items:List[String]):List[String] = items.filter {s => s.nonEmpty}
  def table(rows:Map[String,Int]):String =
    val cells = rows.map{case (k, v) => s"$k=$v"}
    s"""<table>
    |${cells.mkString}
    |</table>""".stripMargin
  val empty = if (header.isEmpty) { 0 } else { 1 }
  def first(xs:List[Int]):Int = xs match
    case all@(x :: _) => x
    case _ => 0
end Report
