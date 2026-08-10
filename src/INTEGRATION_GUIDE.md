# 🌾 Hướng dẫn tích hợp FarmGame vào App.jsx

## BƯỚC 1: Copy file FarmGame.jsx vào project
Đặt file `FarmGame.jsx` cùng thư mục với `App.jsx` (src/)

## BƯỚC 2: Import component (đầu file App.jsx)
Thêm vào sau dòng `import confetti from "canvas-confetti";`:

```js
import FarmGame from "./FarmGame";
```

## BƯỚC 3: Thêm screen vào phần điều hướng màn hình (~dòng 7406)
Tìm đoạn `// --- ĐIỀU HƯỚNG MÀN HÌNH ---` và thêm TRƯỚC `if (screen === "vocab_settings")`:

```js
if (screen === "farm") {
  return (
    <FarmGame
      onBack={() => { playSound("click"); setScreen("home"); }}
      vocabData={/* truyền array vocab ở đây */}
      updateGlobal={updateGlobalStats}
      onSaveWord={handleSaveDifficultWord}
      stats={globalStats.vocab}
    />
  );
}
```

> **Lưu ý về vocabData:**
> Tìm chỗ trong code bạn đang dùng vocab data (thường là `vocabDB` hoặc `defaultVocab`)
> và truyền vào đây. Cần ít nhất 4 từ để quiz hoạt động.

## BƯỚC 4: Thêm nút vào trang Home
Tìm phần render trang Home (khoảng dòng 7492+), thêm nút Farm:

```jsx
<button
  className="home-card mode-btn"
  onClick={() => { playSound("click"); setScreen("farm"); }}
  style={{
    background: "linear-gradient(135deg, #16a34a, #22c55e)",
    color: "white",
    border: "none",
    borderRadius: "18px",
    padding: "18px 20px",
    cursor: "pointer",
    fontWeight: "900",
    fontSize: "15px",
    fontFamily: "inherit",
    boxShadow: "0 6px 20px rgba(22,163,74,0.3)",
    display: "flex",
    alignItems: "center",
    gap: "10px",
  }}>
  <span style={{ fontSize: "28px" }}>🌾</span>
  <div style={{ textAlign: "left" }}>
    <div>Nông Trại Từ Vựng</div>
    <div style={{ fontSize: "12px", opacity: 0.85, fontWeight: "500" }}>
      Trồng cây · Thu hoạch · Học từ
    </div>
  </div>
</button>
```

## ✅ Xong! Các tính năng đã có:
- 🌾 6 ô đất, 5 loại cây có thời gian trồng khác nhau
- 📝 Quiz từ vựng → nhận hạt giống → trồng cây
- 🐛 Hệ thống sâu bệnh (sai câu hỏi → cây bị sâu)
- 🌦️ 3 loại thời tiết ảnh hưởng gameplay
- 🏪 Cửa hàng: phân bón, thuốc sâu, mưa vàng
- 🔥 Hệ thống Streak & Combo
- ⏱️ Timer 15 giây mỗi câu hỏi
- 💾 Ghi nhận vào Firebase qua updateGlobal
