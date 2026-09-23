object Types:
  def f(x:Int, y : String):Int = x
  val +- : Int = 1
  def g[T:Ordering](xs:List[T]) = xs.map: x =>
    x
  val l = 1 :: Nil
  val m = xs :+ 1
  val n = xs +: ys
  class B[T <: A, U >: T]:
    def h(f : Int => Int) = 1
  x match
    case y:Int => 1
  trait C { self: D =>
  }
