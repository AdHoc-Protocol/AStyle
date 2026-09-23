import Foundation

protocol Shape {
func area() -> Double
}

struct Circle: Shape {
let r: Double
var diameter: Double { r*2 }
func area() -> Double {
return .pi*r*r
}
}

enum Direction: String {
case north, south
case east = "E"
}

final class ViewModel {
private(set) var items: [String] = []

func load(completion: @escaping (Result<[String], Error>) -> Void) {
guard let url = URL(string: "https://example.com") else {
return
}
URLSession.shared.dataTask(with: url) { data, _, error in
if let error = error {
completion(.failure(error))
return
}
completion(.success([]))
}.resume()
let sorted = items.sorted { $0 < $1 }.map { $0.uppercased() }
switch sorted.count {
case 0:
print("empty")
case 1, 2:
print("few")
default:
break
}
for (i, item) in items.enumerated() where i > 0 {
print(item)
}
}
}
