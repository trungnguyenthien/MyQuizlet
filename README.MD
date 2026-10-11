# MyQuizlet

Ứng dụng web **PWA** tạo flashcard để tự học, giống Quizlet nhưng **không cần tài khoản, hoạt động hoàn toàn offline**. Bộ thẻ được tạo từ file Markdown, hiển thị code có màu như GitHub, và export ngược lại thành Markdown bất cứ lúc nào.

## 👉 Dùng ngay

**https://trungnguyenthien.github.io/MyQuizlet/**

Mở bằng trình duyệt trên điện thoại hoặc máy tính, sau đó cài vào màn hình chính (xem [Cài đặt như một ứng dụng](#cài-đặt-như-một-ứng-dụng)) để dùng offline.

## Tính năng

- Tạo mới hoặc import bộ thẻ từ file Markdown (`.md`), export ngược lại cùng định dạng.
- Duyệt danh sách các set, đổi tên set, xóa set.
- Câu hỏi và đáp án hiển thị Markdown đầy đủ (danh sách, bảng, trích dẫn...), code block tô màu theo phong cách GitHub (tự đổi theo sáng/tối).
- Nội dung luôn căn giữa card.
- Học ngẫu nhiên: **vuốt lên** để sang thẻ mới (luôn hiện mặt câu hỏi trước), **vuốt ngang** để lật sang mặt đáp án.
- Bật/tắt khả năng xem đáp án cho từng set.
- Offline hoàn toàn, dữ liệu lưu ngay trong trình duyệt của bạn, không gửi đi đâu.

## Cài đặt như một ứng dụng

| Thiết bị                     | Cách cài                                                             |
| ---------------------------- | -------------------------------------------------------------------- |
| **iPhone / iPad (Safari)**   | Nhấn nút **Chia sẻ** → **Thêm vào Màn hình chính**                   |
| **Android (Chrome)**         | Menu **⋮** → **Cài đặt ứng dụng** (hoặc **Thêm vào màn hình chính**) |
| **Máy tính (Chrome / Edge)** | Nhấn biểu tượng cài đặt ở cuối thanh địa chỉ                         |

Sau lần mở đầu tiên (cần mạng), ứng dụng chạy được cả khi bật chế độ máy bay.

## Hướng dẫn sử dụng

### 1. Tạo bộ thẻ bằng file Markdown

Soạn file `.md` theo định dạng sau:

````markdown
# Tên bộ thẻ

## Câu hỏi 1 (viết trên đúng một dòng)

Đáp án 1, có thể nhiều dòng và dùng đầy đủ Markdown.

```swift
let greeting = "Hello"
```

## Câu hỏi 2

- Đáp án dạng danh sách
- Dòng thứ hai
````

Quy tắc:

- Dòng `# ...` đầu tiên là **tên set**. Nếu thiếu, tên file sẽ được dùng làm tên set.
- Mỗi thẻ bắt đầu bằng một dòng `## câu hỏi` và phần đáp án bên dưới. **Không cần dùng `---` để ngăn cách các câu hỏi nữa**, cứ xuất hiện `## ` là hệ thống tự nhận diện chuyển sang câu hỏi mới.
- **Hỗ trợ thẻ không có đáp án sẵn**: Bạn có thể viết liên tiếp các `## Câu hỏi 1\n## Câu hỏi 2\n## Câu hỏi 3` mà không cần dòng đáp án. Khi học, mặt câu hỏi hiển thị đầy đủ và mặt sau có thông báo tự ôn tập/vấn đáp.
- Dòng `## ` nằm **bên trong code block** (` ``` `) sẽ không bị tách thẻ.
- Đường kẻ ngang `---` hoặc `***` bên trong nội dung đáp án hiển thị bình thường.
- Dung lượng file tối đa 5 MB.

### 2. Import

1. Nhấn nút **+** ở màn hình chính.
2. Chọn một hoặc nhiều file `.md`, kéo thả file vào (trên máy tính), hoặc dán trực tiếp nội dung Markdown.
3. Xem lại bản xem trước (tên set, số thẻ, cảnh báo nếu có), chỉnh tên nếu muốn, rồi nhấn **Import**.

Nếu đã có set trùng tên, bạn có thể chọn giữ cả hai hoặc thay thế. Bạn cũng có thể tạo một set trống rồi dán nội dung vào sau.

### 3. Học

1. Chọn một set rồi nhấn **Học**.
2. Thẻ hiện ra với **mặt câu hỏi**. Mỗi lượt học, hệ thống tạo sẵn danh sách thứ tự ngẫu nhiên cho toàn bộ câu hỏi.
3. Thao tác:

| Thao tác                          | Cử chỉ                                 | Bàn phím                | Nút  |
| --------------------------------- | -------------------------------------- | ----------------------- | ---- |
| Thẻ ngẫu nhiên tiếp theo          | Vuốt sang trái                         | `→` hoặc `N`            | Next |
| Lật xem đáp án / quay lại câu hỏi | Chạm vào thẻ hoặc nút "Xem đáp án"     | `Space` `Enter` `↑` `↓` | Flip |
| Quay lại thẻ trước                | Vuốt sang phải                         | `←` hoặc `B`            | Back |

Nội dung đáp án dài có thể **cuộn dọc tự nhiên** mà không bị vướng cử chỉ đổi thẻ. Code block dài có thể cuộn ngang độc lập.

### 4. Cấu hình set

Mở một set để:

- **Đổi tên**: nhấn vào tiêu đề hoặc biểu tượng bút chì, Enter để lưu, Esc để hủy.
- **Sửa Markdown**: nhấn nút **Sửa Markdown** (hoặc chọn trong menu ⋮ của set) để xem và chỉnh sửa trực tiếp toàn bộ nội dung Markdown của bộ thẻ (tiêu đề, câu hỏi, đáp án, thêm/bớt thẻ) với bộ đếm thẻ và kiểm tra cú pháp trực tiếp.
- **Cho phép xem đáp án**: khi tắt, không thể lật thẻ (cử chỉ, phím lẫn nút đều bị khóa), phù hợp để tự nhẩm đáp án trước. Export vẫn bao gồm đáp án.
- **Tìm câu hỏi** trong set.

### 5. Export và sao lưu

Nhấn **Export** trong set để tải về file `.md` cùng định dạng ở trên (trên điện thoại sẽ mở bảng chia sẻ nếu trình duyệt hỗ trợ). File này có thể import lại nguyên vẹn hoặc dùng để sao lưu/chia sẻ cho thiết bị khác.

### 6. Xóa set

Chọn **Xóa** trong menu của set và xác nhận. Bạn có vài giây để bấm **Hoàn tác**.

## Lưu ý về dữ liệu

- Dữ liệu nằm trong bộ nhớ của **trình duyệt trên thiết bị đang dùng**, không đồng bộ giữa các thiết bị.
- Xóa dữ liệu trang web / dữ liệu duyệt web sẽ làm mất các set. Hãy **export để sao lưu** định kỳ.
- Chế độ ẩn danh có thể không lưu dữ liệu sau khi đóng cửa sổ.
- Ảnh trong Markdown dạng link từ internet sẽ không hiển thị khi offline.

## Câu hỏi thường gặp

**Ứng dụng không cập nhật bản mới?** Khi có phiên bản mới, ứng dụng hiện thông báo _Có bản cập nhật_, nhấn **Tải lại**. Nếu không thấy, đóng hẳn ứng dụng rồi mở lại khi có mạng.

**Vuốt lên bị kéo làm tải lại trang?** Cài ứng dụng vào màn hình chính để dùng chế độ toàn màn hình.

**Code block không có màu?** Hãy ghi tên ngôn ngữ ngay sau ba dấu backtick, ví dụ ` ```swift `, ` ```json `.

## Chạy trên máy (dành cho phát triển)

Ứng dụng chỉ gồm HTML, CSS và JavaScript thuần, không cần build. Service worker yêu cầu HTTPS hoặc `localhost`, vì vậy hãy chạy qua một server tĩnh:

```bash
git clone https://github.com/trungnguyenthien/MyQuizlet.git
cd MyQuizlet
python3 -m http.server 8080
# mở http://localhost:8080
```

## Triển khai lên GitHub Pages

1. Đẩy mã nguồn lên nhánh `main`.
2. Vào **Settings → Pages**, chọn **Deploy from a branch**, nhánh `main`, thư mục `/ (root)`.
3. Sau ít phút, trang chạy tại `https://trungnguyenthien.github.io/MyQuizlet/`.

Toàn bộ đường dẫn trong dự án là đường dẫn tương đối nên chạy đúng trong thư mục con `/MyQuizlet/`. Mỗi khi sửa file được cache, hãy tăng số phiên bản cache trong `sw.js` (ví dụ `mq-static-v2`) để người dùng nhận bản mới.

## Công nghệ

HTML + CSS + JavaScript (ES6) thuần · [marked](https://github.com/markedjs/marked) · [highlight.js](https://highlightjs.org/) · [DOMPurify](https://github.com/cure53/DOMPurify) · Service Worker · localStorage

## Giấy phép

Chưa chỉ định. Thêm file `LICENSE` (ví dụ MIT) nếu bạn muốn chia sẻ mã nguồn.
