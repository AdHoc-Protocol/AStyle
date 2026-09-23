import Foundation

protocol Shape {
func area() -> Double
}

struct Circle: Shape {
let r: Double
var diameter: Double { r * 2 }
func area() -> Double {
return .pi * r * r
}
}

enum Direction: String {
case north, south
case east = "E"
}

class ViewModel: ObservableObject {
@Published var items: [String] = []
private var cache: [Int: String]?

func load(completion: @escaping (Result<[String], Error>) -> Void) {
guard let url = URL(string: "https://x") else {
return
}
URLSession.shared.dataTask(with: url) { data, response, error in
if let error = error {
completion(.failure(error))
return
}
completion(.success([]))
}.resume()
let sorted = items.sorted { $0 < $1 }.map { $0.uppercased() }
switch direction {
case .north:
print("n")
case .south, .east:
print("other")
default:
break
}
for (i, item) in items.enumerated() where i > 0 {
print(item)
}
let s = """
    multi
    line \(value)
    """
let x = cond ? a : b
let y = value ?? 0
}
}
