package com.example

import kotlinx.coroutines.*

data class User(val id: Int, val name: String?)

sealed class Result<out T> {
    data class Success<T>(val value: T) : Result<T>()
    object Loading : Result<Nothing>()
}

interface Repo {
    suspend fun load(id: Int): User
}

class Service(private val repo: Repo) : Repo by repo {
    private val cache = mutableMapOf<Int, User>()

    fun describe(r: Result<User>): String = when (r) {
        is Result.Success -> "ok ${r.value.name ?: "anon"}"
        Result.Loading -> "loading"
        else -> "other"
    }

    fun process(items: List<Int>) {
        val evens = items.filter { it % 2 == 0 }.map { it * 2 }
        items.forEach { item ->
            println(item)
        }
        val total = items
            .filter { it > 0 }
            .sum()
        if (total > 10) {
            println("big")
        } else if (total > 5) println("mid")
        else {
            println("small")
        }
        for (i in 0 until 10) {
            cache[i]?.let { println(it.name) }
        }
        when {
            total > 100 -> println("huge")
            else -> println("?")
        }
        try {
            risky()
        } catch (e: Exception) {
            log(e)
        } finally {
            done()
        }
        val s = """
    raw ${total}
    text
""".trimIndent()
    }

    companion object {
        const val MAX = 10
        fun create() = Service(object : Repo {
            override suspend fun load(id: Int) = User(id, null)
        })
    }
}
