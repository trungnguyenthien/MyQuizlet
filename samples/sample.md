---
# Swift & Web Development Mastery
---
## What is the difference between a value type and a reference type in Swift?

Value types (structs, enums, tuples) are copied when assigned or passed, while reference types (classes, actors) share a single underlying instance.
---
## What are the key lifecycle phases of a SwiftUI View?

- **Initialization**: View struct is created with initial state values.
- **Evaluation**: The `body` computed property is executed to return the view hierarchy.
- **Diffing & Render**: SwiftUI computes differences and updates underlying platform render trees.
- **Destruction**: State is invalidated and discarded when the view is no longer rendered.
---
## Compare SQL vs NoSQL database characteristics

| Feature | Relational (SQL) | Document / NoSQL |
| :--- | :--- | :--- |
| Schema | Rigid, predefined | Flexible, dynamic |
| Scaling | Vertical (ACID focus) | Horizontal (CAP theorem) |
| Queries | Structured SQL joins | Document queries & aggregation |
---
## Why is offline-first architecture critical for mobile learners?

> Offline-first applications treat network connectivity as an enhancement rather than a requirement. Learners need reliable access regardless of subway tunnels, airplane mode, or spotty cellular coverage.
---
## How do you create an asynchronous task group in Swift?

```swift
func fetchAllUserData(ids: [String]) async throws -> [UserData] {
    try await withThrowingTaskGroup(of: UserData.self) { group in
        for id in ids {
            group.addTask {
                try await apiService.fetchUser(id: id)
            }
        }
        var results: [UserData] = []
        for try await user in group {
            results.append(user)
        }
        return results
    }
}
```
---
## How does the Markdown parser handle nested separators inside code fences?

Here is a fenced code sample that contains what would otherwise look like card dividers and questions:

```markdown
---
## not a question
let separator = "---"
print("This line has --- and ## inside code fences")
```

The parser must preserve this entire code block without prematurely splitting the card or treating inner lines as new card titles.
---
## What is an empty answer card in MyQuizlet?

---
