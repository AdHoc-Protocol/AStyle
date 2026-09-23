package example

import java.io.{File, IOException}

object Main extends App {
val words = List("scala", "astyle", "format")
      def count(xs: List[String]): Map[Char, Int] = {
  xs.flatMap(_.toList).groupBy(identity).map { case (c, cs) =>
      c -> cs.size
  }
      }

  def read(path: String): Option[String] = {
    try {
  val source = scala.io.Source.fromFile(path)
      Some(source.mkString)
    }
      catch {
    case e: IOException =>
          None
    }
  }

def loop(n: Int): Unit = {
  var i = 0
  while (i < n) {
  if (i % 2 == 0) println(s"even $i")
  else {
  println(s"odd ${i * 2}")
  }
  i += 1
  }
  }

  val squares = for {
  x <- 1 to 10
    if x % 2 == 0
  } yield x * x

val json = """{"name": "astyle", "braces": "{}"}"""
  val ch = '{'
  val op = words.foldLeft(0) { (acc, w) =>
  acc + w.length
  }
}
