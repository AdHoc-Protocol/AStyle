package com.example

import kotlinx.coroutines.*

data class User(val id:Int,val name:String?)

sealed class Result<out T> {
data class Success<T>(val value:T):Result<T>()
object Loading:Result<Nothing>()
}

class UserService(private val repo:Repository){
private val cache=mutableMapOf<Int,User>()

fun describe(r:Result<User>):String=when(r){
is Result.Success->"ok ${r.value.name?:"anon"}"
Result.Loading->"loading"
}

suspend fun load(ids:List<Int>){
val users=ids.filter{it>0}.map{repo.load(it)}
users.forEach{user->
cache[user.id]=user
}
if(users.isEmpty()){
println("none")
} else if (users.size>100) println("many")
else {
println(users.size)
}
try { save() } catch(e:Exception){ log(e) } finally { done() }
}

companion object {
const val MAX=10
}
}
