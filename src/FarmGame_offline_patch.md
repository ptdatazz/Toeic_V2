# 🕐 Patch: Nông trại chạy ngầm khi offline

## Vấn đề
Tất cả timer trong FarmGame đều dùng `setInterval` trong React — khi thoát tab hoặc đóng trình duyệt, chúng **dừng hết**. Cây không lớn, mùa không đổi, thời tiết đứng yên.

## Giải pháp
Lưu `lastSaved: Date.now()` vào Firebase (code hiện tại đã có). Khi người dùng quay lại, tính "thời gian đã trôi qua" (`offlineSeconds`) rồi **bù ngay vào mọi state** trước khi bắt đầu các interval thông thường.

---

## THAY ĐỔI 1: Hàm tính bù thời gian offline

Thêm hàm helper này **ngay trước `export default function FarmGame`** (khoảng dòng 277):

```js
// ===== BÙ THỜI GIAN OFFLINE =====
// Trả về farmState mới đã được tính tiến theo offlineSecs giây
function applyOfflineTime(farmState, offlineSecs) {
  if (!farmState || offlineSecs <= 0) return farmState;

  // Giới hạn tối đa 7 ngày thực (604800s) để tránh bù quá nhiều
  const secs = Math.min(offlineSecs, 604800);

  // --- Bù cây trồng (plots) ---
  let updatedPlots = (farmState.plots || []).map(plot => {
    if (plot.stage === 0 || plot.stage === 3 || plot.hasPest) return plot;
    let remaining = plot.timeLeft || 0;
    let stage = plot.stage;
    let elapsed = secs;
    // Mỗi stage có growTime riêng; đơn giản hóa: dùng growTime của cây
    const crop = [
      { id: "wheat", growTime: 30 }, { id: "carrot", growTime: 45 },
      { id: "strawberry", growTime: 60 }, { id: "corn", growTime: 75 },
      { id: "watermelon", growTime: 120 }, { id: "mushroom", growTime: 90 },
      { id: "pumpkin", growTime: 100 }, { id: "cherry", growTime: 80 },
    ].find(c => c.id === plot.crop);
    const growTime = crop?.growTime || 30;

    while (elapsed > 0 && stage < 3) {
      if (elapsed >= remaining) {
        elapsed -= remaining;
        stage++;
        remaining = stage < 3 ? growTime : 0;
      } else {
        remaining -= elapsed;
        elapsed = 0;
      }
    }
    return { ...plot, stage, timeLeft: stage < 3 ? remaining : 0 };
  });

  // --- Bù seasonTimer & weatherTimer ---
  let seasonTimer = farmState.seasonTimer ?? 27000;
  let weatherTimer = farmState.weatherTimer ?? 300;
  let season = farmState.season ?? "spring";
  let farmDay = farmState.farmDay ?? 1;
  let farmMonth = farmState.farmMonth ?? 1;
  let farmYear = farmState.farmYear ?? 1;

  const SEASON_ORDER = ["spring", "summer", "autumn", "winter"];
  const FARM_DAY_SEC = 300;
  const FARM_DAYS_PER_MONTH = 30;
  const FARM_MONTHS_PER_SEASON = 3;
  const SEASON_DURATION_SEC = 27000;

  let remainSecs = secs;

  // Bù từng ngày một (nhanh hơn bù từng giây)
  while (remainSecs > 0) {
    const tickDay = Math.min(remainSecs, weatherTimer);
    weatherTimer -= tickDay;
    seasonTimer -= tickDay;
    remainSecs -= tickDay;

    if (weatherTimer <= 0) {
      // Sang ngày mới
      weatherTimer = FARM_DAY_SEC;
      farmDay++;
      if (farmDay > FARM_DAYS_PER_MONTH) {
        farmDay = 1;
        farmMonth++;
        if (farmMonth > FARM_MONTHS_PER_SEASON) {
          farmMonth = 1;
        }
      }
    }

    if (seasonTimer <= 0) {
      // Sang mùa mới
      seasonTimer = SEASON_DURATION_SEC;
      const idx = SEASON_ORDER.indexOf(season);
      const nextIdx = (idx + 1) % 4;
      season = SEASON_ORDER[nextIdx];
      farmDay = 1;
      farmMonth = 1;
      if (nextIdx === 0) farmYear++;
    }
  }

  return {
    ...farmState,
    plots: updatedPlots,
    seasonTimer,
    weatherTimer,
    season,
    farmDay,
    farmMonth,
    farmYear,
  };
}
```

---

## THAY ĐỔI 2: Gọi hàm bù khi load dữ liệu

Trong `loadFarmData` (khoảng dòng 572), **ngay sau khi đọc `farmState`**, thêm đoạn bù trước khi `setState`:

```js
if (farmState && farmState.plots) {
  // ===== BÙ THỜI GIAN OFFLINE =====
  const lastSaved = farmState.lastSaved || Date.now();
  const offlineSecs = Math.floor((Date.now() - lastSaved) / 1000);
  const compensated = offlineSecs > 5 ? applyOfflineTime(farmState, offlineSecs) : farmState;
  // Thông báo nếu offline lâu
  if (offlineSecs > 60) {
    console.log(`[Farm] Đã offline ${Math.floor(offlineSecs/60)} phút, đang bù thời gian...`);
  }
  // =============================================
  // Dùng `compensated` thay vì `farmState` cho toàn bộ setState bên dưới:
  setPlots(compensated.plots);
  setPlotCount(compensated.plotCount ?? DEFAULT_PLOT_COUNT);
  setCoins(compensated.coins ?? 50);
  setGems(compensated.gems ?? 0);
  setSeeds(compensated.seeds ?? 3);
  setScore(compensated.score ?? 0);
  setStreak(compensated.streak ?? 0);
  setWeather(compensated.weather ?? "sunny");
  setSeason(compensated.season ?? "spring");
  setSeasonTimer(compensated.seasonTimer ?? SEASON_DURATION_SEC);
  setWeatherTimer(compensated.weatherTimer ?? WEATHER_DURATION_SEC);
  // ... (tất cả setState còn lại giữ nguyên, chỉ đổi farmState → compensated)
```

> **Chú ý**: Thay tất cả `farmState.xxx` bên dưới thành `compensated.xxx` trong block `if (farmState && farmState.plots)`.

---

## THAY ĐỔI 3: Đảm bảo `lastSaved` luôn lưu đúng

Trong phần **TỰ ĐỘNG LƯU** (khoảng dòng 692), đã có `lastSaved: Date.now()` — **giữ nguyên**, không cần đổi.

---

## Kết quả sau khi patch

| Tình huống | Trước | Sau |
|---|---|---|
| Chuyển sang tab ôn luyện 30 phút | Cây đứng yên | Cây lớn thêm 30 phút |
| Đóng trình duyệt qua đêm | Mọi thứ đóng băng | Sáng hôm sau cây chín hết |
| Đổi mùa trong lúc offline | Không xảy ra | Tự động tính mùa đúng |
| Cây cổ thụ hồi quả | Không hồi | Hồi đúng (đã dùng timestamp sẵn) |

## Lưu ý
- Cây cổ thụ (`ancientTrees`) đã dùng `availableAt` timestamp nên **không cần bù thêm** — đúng rồi.
- Vật nuôi (`livestock`) nếu muốn bù, cần thêm logic tương tự plots vào `applyOfflineTime`.
- Sâu bọ không bù (không muốn người dùng quay lại thấy tất cả ô bị sâu).
