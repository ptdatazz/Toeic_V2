// ============================================================
// FARM VOCAB GAME - Phiên bản cập nhật (Tự động, có đếm ngược)
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react";

const PLOT_COUNT = 6;

// GIẢM THỜI GIAN THU HOẠCH (đơn vị: giây thực tế)
const CROP_TYPES = [
  { id: "wheat",      name: "Lúa mì",    emoji: "🌾", growTime: 30,   reward: 10, color: "#f59e0b", bg: "#fef3c7" },  // 8 giây
  { id: "carrot",     name: "Cà rốt",    emoji: "🥕", growTime: 45,  reward: 15, color: "#f97316", bg: "#ffedd5" },  // 12 giây
  { id: "strawberry", name: "Dâu tây",   emoji: "🍓", growTime: 60,  reward: 25, color: "#ec4899", bg: "#fce7f3" },  // 16 giây
  { id: "corn",       name: "Ngô",       emoji: "🌽", growTime: 75,  reward: 30, color: "#eab308", bg: "#fefce8" },  // 20 giây
  { id: "watermelon", name: "Dưa hấu",   emoji: "🍉", growTime: 120,  reward: 50, color: "#22c55e", bg: "#dcfce7" },  // 25 giây
];

const SHOP_ITEMS = [
  { id: "fertilizer", name: "Phân bón",  emoji: "💊", price: 30, desc: "Cây mọc tức thì" },
  { id: "pesticide",  name: "Thuốc sâu", emoji: "🧴", price: 20, desc: "Diệt sâu 1 ô" },
  { id: "rain",       name: "Mưa vàng",  emoji: "🌧️", price: 50, desc: "Tất cả cây +5 giây" },
];

const GROWTH_STAGES = [
  { stage: 0, label: "Đất trống",    emoji: "🟫" },
  { stage: 1, label: "Hạt giống",    emoji: "🌱" },
  { stage: 2, label: "Cây non",      emoji: "🌿" },
  { stage: 3, label: "Trưởng thành", emoji: "✨" },
];

// ========== HÀM LƯU TRẠNG THÁI ==========
const SAVE_KEY = "farm_game_state";

const loadSavedState = () => {
  try {
    const saved = localStorage.getItem(SAVE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.plots && Array.isArray(parsed.plots) && parsed.plots.length === PLOT_COUNT) {
        return parsed;
      }
    }
  } catch (e) {
    console.error("Lỗi đọc dữ liệu:", e);
  }
  return null;
};

const saveGameState = (state) => {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("Lỗi lưu dữ liệu:", e);
  }
};

const shuffleArray = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const getMeaning = (item) => {
  if (item.meaning && item.meaning.trim()) return item.meaning.trim();
  const parts = [
    item.noun_meaning && `(n) ${item.noun_meaning}`,
    item.verb_meaning && `(v) ${item.verb_meaning}`,
    item.adj_meaning  && `(adj) ${item.adj_meaning}`,
  ].filter(Boolean);
  if (parts.length > 0) return parts.join(" / ");
  if (typeof item === "string") return "???";
  if (item.word && !item.meaning) return `(${item.word})`;
  return "???";
};

const genQuestion = (vocabList) => {
  if (!vocabList || vocabList.length < 4) return null;
  const shuffled = shuffleArray(vocabList);
  const item = shuffled[0];
  const wrongPool = shuffled.slice(1, 4).map((w) => getMeaning(w));
  const answer = getMeaning(item);
  const options = shuffleArray([answer, ...wrongPool]);
  return { word: item.word, answer, options, item };
};

export default function FarmGame({ onBack, vocabData = [], updateGlobal, onSaveWord, stats }) {
  const savedState = loadSavedState();
  
  // plots mỗi ô có thêm timeLeft (thời gian còn lại đến khi thu hoạch)
  const [plots, setPlots] = useState(() => {
    if (savedState && savedState.plots) {
      return savedState.plots;
    }
    return Array.from({ length: PLOT_COUNT }, (_, i) => ({
      id: i, crop: null, stage: 0, hasPest: false, linkedWord: null, timeLeft: 0,
    }));
  });

  const [coins, setCoins] = useState(() => savedState?.coins ?? 50);
  const [seeds, setSeeds] = useState(() => savedState?.seeds ?? 3);
  const [score, setScore] = useState(() => savedState?.score ?? 0);
  const [streak, setStreak] = useState(() => savedState?.streak ?? 0);
  const [weather, setWeather] = useState(() => savedState?.weather ?? "sunny");

  

  // === TỰ ĐỘNG LƯU ===
  useEffect(() => {
    const stateToSave = { plots, coins, seeds, score, streak, weather, lastSaved: Date.now() };
    saveGameState(stateToSave);
  }, [plots, coins, seeds, score, streak, weather]);

  const [selectedCrop, setSelectedCrop] = useState(CROP_TYPES[0]);
  const [activePanel, setActivePanel]   = useState("farm");
  const [showHarvest, setShowHarvest]   = useState(null);
  const [notification, setNotification] = useState(null);

  const [question, setQuestion]     = useState(null);
  const [answered, setAnswered]     = useState(false);
  const [chosenOpt, setChosenOpt]   = useState(null);
  const [quizTarget, setQuizTarget] = useState(null);
  const [timeLeft, setTimeLeft]     = useState(15);
  const timerRef = useRef(null);

    // === TIMER CHO QUIZ (ĐẾM NGƯỢC 15s) ===
  useEffect(() => {
    // Chỉ chạy khi đang ở tab quiz, chưa trả lời, và có câu hỏi
    if (activePanel !== "quiz" || answered || !question) return;
    
    // Reset timer về 15s mỗi khi câu hỏi mới
    setTimeLeft(15);
    
    // Xóa timer cũ nếu có
    if (timerRef.current) clearInterval(timerRef.current);
    
    // Tạo timer mới
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          // Hết giờ, xóa timer và xử lý sai
          clearInterval(timerRef.current);
          timerRef.current = null;
          handleAnswer(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    // Cleanup khi thoát quiz hoặc chuyển câu
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [question, activePanel, answered]); // Chạy lại khi câu hỏi hoặc trạng thái thay đổi

  // === TIMER TỰ ĐỘNG TĂNG TRƯỞNG CÂY (mỗi giây) ===
  useEffect(() => {
    const interval = setInterval(() => {
      setPlots(prev => prev.map(plot => {
        if (plot.stage === 0 || plot.stage === 3) return plot;
        if (plot.hasPest) return plot; // Có sâu thì ngừng phát triển
        
        const newTimeLeft = Math.max(0, (plot.timeLeft || 0) - 1);
        const crop = CROP_TYPES.find(c => c.id === plot.crop);
        const totalTime = crop ? crop.growTime : 10;
        
        // Khi timeLeft về 0, tăng stage
        if (newTimeLeft <= 0 && plot.stage < 3) {
          const newStage = plot.stage + 1;
          const newTimeLeftForNext = newStage === 3 ? 0 : (crop ? crop.growTime : 10);
          return { ...plot, stage: newStage, timeLeft: newTimeLeftForNext };
        }
        
        return { ...plot, timeLeft: newTimeLeft };
      }));
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);

  // === SÂU BỌ XUẤT HIỆN NGẪU NHIÊN TRONG QUÁ TRÌNH SINH TRƯỞNG ===
  useEffect(() => {
    const pestInterval = setInterval(() => {
      setPlots(prev => prev.map(plot => {
        // Chỉ xuất hiện sâu khi cây đang phát triển (stage 1 hoặc 2) và chưa có sâu
        if ((plot.stage === 1 || plot.stage === 2) && !plot.hasPest && Math.random() < 0.15) {
          return { ...plot, hasPest: true };
        }
        return plot;
      }));
    }, 5000); // Mỗi 5 giây kiểm tra 1 lần
    
    return () => clearInterval(pestInterval);
  }, []);

  const notify = (text, color = "#22c55e") => {
    setNotification({ text, color });
    setTimeout(() => setNotification(null), 2200);
  };

  const plantOnPlot = (plotId) => {
    if (seeds <= 0) { notify("Hết hạt giống! Trả lời đúng để nhận thêm 🌱", "#ef4444"); return; }
    
    const crop = selectedCrop;
    setPlots((prev) =>
      prev.map((p) =>
        p.id === plotId ? { 
          ...p, 
          crop: crop.id, 
          stage: 1, 
          hasPest: false, 
          linkedWord: null, 
          timeLeft: crop.growTime  // Thời gian đến stage tiếp theo
        } : p
      )
    );
    setSeeds((s) => s - 1);
    notify(`🌱 Đã trồng ${crop.name}!`);
  };

  const harvestPlot = (plotId) => {
    const plot = plots.find((p) => p.id === plotId);
    if (!plot || plot.stage !== 3) return;
    const crop = CROP_TYPES.find((c) => c.id === plot.crop);
    const reward = crop ? crop.reward : 10;
    const bonus = weather === "rainy" ? Math.floor(reward * 0.5) : 0;
    const total = reward + bonus;
    setCoins((c) => c + total);
    setSeeds((s) => s + 1);
    setScore((sc) => sc + 1);
    setPlots((prev) =>
      prev.map((p) =>
        p.id === plotId ? { ...p, crop: null, stage: 0, hasPest: false, linkedWord: null, timeLeft: 0 } : p
      )
    );
    setShowHarvest({ plotId, reward: total, bonus });
    setTimeout(() => setShowHarvest(null), 1800);
    if (updateGlobal && plot.linkedWord) updateGlobal("vocab", true, plot.linkedWord);
  };

  const startQuiz = (targetPlotId = null) => {
  if (!vocabData || vocabData.length < 4) { notify("Cần ít nhất 4 từ vựng để chơi!", "#ef4444"); return; }
  const q = genQuestion(vocabData);
  if (!q) return;
  
  // 👇 THÊM 2 DÒNG NÀY
  if (timerRef.current) clearInterval(timerRef.current);
  setTimeLeft(15);
  
  setQuestion(q);
  setAnswered(false);
  setChosenOpt(null);
  setQuizTarget(targetPlotId);
  setActivePanel("quiz");
};

  const handleAnswer = (opt) => {
   if (timerRef.current) {
    clearInterval(timerRef.current);
    timerRef.current = null;
  }
    setAnswered(true);
    setChosenOpt(opt);
    const isCorrect = opt === question?.answer;
    if (isCorrect) {
      const newStreak = streak + 1;
      setStreak(newStreak);
      const bonus = newStreak >= 5 ? 2 : 1;
      setSeeds((s) => s + bonus);
      if (quizTarget !== null) {
        setPlots((prev) =>
          prev.map((p) => (p.id === quizTarget ? { ...p, linkedWord: question.item.word } : p))
        );
      }
      if (updateGlobal) updateGlobal("vocab", true, question.item.word);
      notify(newStreak >= 3 ? `🔥 x${newStreak} COMBO! +${bonus} 🌱` : "✅ Đúng rồi! +1 🌱");
    } else {
      setStreak(0);
      if (updateGlobal) updateGlobal("vocab", false, question.item.word);
      notify("❌ Sai rồi! Cây có thể bị sâu...", "#ef4444");
      if (quizTarget !== null && Math.random() < 0.4) {
        setPlots((prev) =>
          prev.map((p) => (p.id === quizTarget && p.stage >= 1 ? { ...p, hasPest: true } : p))
        );
      }
    }
  };

  // === TỰ ĐỘNG DIỆT SÂU KHI ĐẠT STREAK x3 ===
useEffect(() => {
  if (streak >= 3) {
    // Kiểm tra xem có sâu nào không
    const hasAnyPest = plots.some(plot => plot.hasPest);
    if (hasAnyPest) {
      // Diệt toàn bộ sâu
      setPlots(prev => prev.map(plot => ({ ...plot, hasPest: false })));
      notify(`✨ Streak x${streak}! Toàn bộ sâu đã bị tiêu diệt! ✨`, "#8b5cf6");
    }
  }
}, [streak]); // Chạy mỗi khi streak thay đổi

  // ===== THAY THẾ HÀM killPest =====
const killPest = (plotId) => {
  // Kiểm tra streak có đủ 3 không
  if (streak < 3) {
    notify(`🔒 Cần đạt Streak x3 mới được diệt sâu! Hiện tại: x${streak}`, "#ef4444");
    // Chuyển sang làm quiz để tăng streak
    startQuiz(plotId);
    return;
  }
  
  // Đủ streak, diệt sâu ngay lập tức
  setPlots((prev) =>
    prev.map((p) => (p.id === plotId ? { ...p, hasPest: false } : p))
  );
  notify(`✅ Đã diệt sâu! (Streak x${streak})`, "#22c55e");
  
  // Giảm streak 1 điểm sau khi diệt sâu (tùy chọn, có thể bỏ)
  // setStreak(prev => Math.max(0, prev - 1));
};

  const buyItem = (itemId) => {
    const item = SHOP_ITEMS.find((i) => i.id === itemId);
    if (!item || coins < item.price) { notify("Không đủ xu!", "#ef4444"); return; }
    setCoins((c) => c - item.price);
    if (itemId === "fertilizer") {
      setPlots((prev) => prev.map((p) => {
        if (p.stage >= 1 && p.stage < 3 && !p.hasPest) {
          const newStage = Math.min(3, p.stage + 1);
          return { ...p, stage: newStage, timeLeft: newStage === 3 ? 0 : (CROP_TYPES.find(c => c.id === p.crop)?.growTime || 10) };
        }
        return p;
      }));
      notify("💊 Phân bón! Tất cả cây lớn thêm 1 tầng!");
    } else if (itemId === "pesticide") {
      setPlots((prev) => prev.map((p) => ({ ...p, hasPest: false })));
      notify("🧴 Đã diệt sâu toàn bộ!");
    } else if (itemId === "rain") {
      setPlots((prev) => prev.map((p) => {
        if (p.stage >= 1 && p.stage < 3 && !p.hasPest) {
          // Mưa vàng giảm 5 giây thời gian phát triển
          const newTimeLeft = Math.max(0, (p.timeLeft || 0) - 5);
          return { ...p, timeLeft: newTimeLeft };
        }
        return p;
      }));
      notify("🌧️ Mưa vàng! Cây phát triển nhanh hơn!");
    }
  };

  const resetGame = () => {
    if (window.confirm("⚠️ Bạn có chắc muốn RESET nông trại? Tất cả dữ liệu sẽ bị mất!")) {
      localStorage.removeItem(SAVE_KEY);
      setPlots(Array.from({ length: PLOT_COUNT }, (_, i) => ({
        id: i, crop: null, stage: 0, hasPest: false, linkedWord: null, timeLeft: 0,
      })));
      setCoins(50);
      setSeeds(3);
      setScore(0);
      setStreak(0);
      setWeather("sunny");
      notify("🔄 Đã reset nông trại về mặc định!", "#ef4444");
    }
  };

  const weatherInfo = {
    sunny:  { emoji: "☀️",  label: "Nắng đẹp", tip: "Trồng cây bình thường",       bg: "linear-gradient(160deg,#e8f5e9 0%,#f0f9f0 40%,#e3f2fd 100%)" },
    rainy:  { emoji: "🌧️", label: "Mưa vàng",  tip: "Thu hoạch +50% xu!",          bg: "linear-gradient(160deg,#e3f2fd 0%,#f0f9f0 40%,#e8f5e9 100%)" },
    stormy: { emoji: "⛈️",  label: "Bão tố",   tip: "Cây dễ bị sâu hơn",           bg: "linear-gradient(160deg,#ede7f6 0%,#fce4ec 40%,#e8eaf6 100%)" },
  };
  const w = weatherInfo[weather];

  const cropEmoji = (plot) => {
    if (plot.hasPest) return "🐛";
    if (plot.stage === 0) return null;
    const crop = CROP_TYPES.find((c) => c.id === plot.crop);
    if (!crop) {
      if (plot.stage === 3) return "🌾";
      if (plot.stage === 2) return "🌿";
      return "🌱";
    }
    if (plot.stage === 3) return crop.emoji;
    return GROWTH_STAGES[plot.stage]?.emoji || "🌱";
  };

  const totalPlanted    = plots.filter((p) => p.stage >= 1).length;
  const readyToHarvest  = plots.filter((p) => p.stage === 3).length;
  const pestCount       = plots.filter((p) => p.hasPest).length;

  // Format thời gian (giây -> mm:ss)
  const formatTime = (seconds) => {
    if (!seconds || seconds <= 0) return "0s";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}p${secs}s` : `${secs}s`;
  };

  // STYLES
  const S = {
    wrap: {
      height: "100vh", width: "100vw", display: "flex", flexDirection: "column",
      fontFamily: "'Nunito', 'Segoe UI', system-ui, sans-serif",
      background: w.bg, transition: "background 1s", boxSizing: "border-box",
      overflow: "hidden", position: "fixed", top: 0, left: 0,
    },
    topbar: {
      background: "rgba(255,255,255,0.88)", backdropFilter: "blur(14px)",
      padding: "8px 20px", display: "flex", alignItems: "center",
      justifyContent: "space-between", boxShadow: "0 2px 14px rgba(0,0,0,0.07)",
      flexShrink: 0,
    },
    backBtn: {
      background: "transparent", border: "none", cursor: "pointer",
      fontWeight: "700", fontSize: "14px", color: "#64748b",
      fontFamily: "inherit", padding: "6px 10px", borderRadius: "8px",
      display: "flex", alignItems: "center", gap: "4px",
    },
    resetBtn: {
      background: "#ef4444", color: "white", border: "none", borderRadius: "8px",
      padding: "4px 12px", fontWeight: "700", fontSize: "12px", cursor: "pointer",
      fontFamily: "inherit",
    },
    title: { display: "flex", alignItems: "center", gap: "6px", fontWeight: "900", fontSize: "17px", color: "#166534" },
    statsRow: { display: "flex", gap: "14px", alignItems: "center" },
    statChip: (color) => ({ fontWeight: "800", fontSize: "14px", color, display: "flex", alignItems: "center", gap: "3px" }),
    weatherBar: {
      background: "rgba(255,255,255,0.55)", backdropFilter: "blur(8px)",
      padding: "5px 20px", display: "flex", alignItems: "center",
      justifyContent: "space-between", fontSize: "13px", color: "#374151",
      borderBottom: "1px solid rgba(0,0,0,0.06)", flexShrink: 0,
    },
    tabBar: {
      display: "flex", gap: "8px", padding: "7px 20px",
      background: "rgba(255,255,255,0.45)", flexShrink: 0, alignItems: "center",
    },
    tab: (active, color) => ({
      background: active ? color : "rgba(255,255,255,0.85)",
      color: active ? "white" : "#374151",
      border: "none", borderRadius: "12px", padding: "8px 16px",
      fontWeight: "800", fontSize: "13px", cursor: "pointer", fontFamily: "inherit",
      boxShadow: active ? `0 4px 12px ${color}40` : "0 1px 4px rgba(0,0,0,0.08)",
      transition: "all 0.15s",
    }),
    alertChip: (bg, color) => ({
      background: bg, color, padding: "4px 11px", borderRadius: "10px",
      fontWeight: "800", fontSize: "12px", marginLeft: "4px",
    }),
    main: { flex: 1, overflowY: "auto", padding: "12px 20px", display: "flex", flexDirection: "column" },
    sectionLabel: { fontSize: "13px", fontWeight: "800", color: "#374151", marginBottom: "10px", display: "flex", alignItems: "center", gap: "5px" },
    cropBtn: (active, crop) => ({
      background: active ? crop.color : "rgba(255,255,255,0.85)",
      color: active ? "white" : "#374151",
      border: `2px solid ${active ? crop.color : "transparent"}`,
      borderRadius: "12px", padding: "7px 14px", cursor: "pointer",
      fontWeight: "800", fontSize: "13px", fontFamily: "inherit",
      boxShadow: active ? `0 3px 10px ${crop.color}55` : "0 1px 3px rgba(0,0,0,0.08)",
      transition: "all 0.15s", display: "flex", alignItems: "center", gap: "5px",
    }),
    cropBadge: { fontSize: "11px", opacity: 0.85 },
    grid: {
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: "14px",
      maxWidth: "650px",
      margin: "16px auto 0",
    },
    plotCell: (plot) => ({
      background: plot.stage === 3 ? "linear-gradient(135deg,#d1fae5,#a7f3d0)" : plot.hasPest ? "linear-gradient(135deg,#fee2e2,#fecaca)" : plot.stage === 0 ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.88)",
      border: plot.stage === 3 ? "2px solid #34d399" : plot.hasPest ? "2px solid #f87171" : "2px solid rgba(255,255,255,0.8)",
      borderRadius: "20px", padding: "12px 8px", textAlign: "center",
      boxShadow: plot.stage === 3 ? "0 4px 18px rgba(34,197,94,0.25)" : plot.hasPest ? "0 4px 14px rgba(239,68,68,0.2)" : "0 2px 10px rgba(0,0,0,0.07)",
      minHeight: "130px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px",
      position: "relative", cursor: "pointer", transition: "transform 0.13s",
    }),
    plotIcon: { fontSize: "36px", lineHeight: 1 },
    plotLabel: (color) => ({ fontSize: "10px", fontWeight: "700", color }),
    timerText: { fontSize: "10px", color: "#f59e0b", fontWeight: "600", marginTop: "2px" },
    emptyPlotIcon: { width: "50px", height: "50px", borderRadius: "12px", background: "linear-gradient(135deg,#6b4226,#8b5a2b)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px" },
    linkedWordTag: { fontSize: "9px", background: "#dbeafe", color: "#1d4ed8", padding: "2px 6px", borderRadius: "6px", fontWeight: "800" },
  };

  return (
    <div style={S.wrap}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@600;700;800;900&display=swap');
        html, body { margin: 0; padding: 0; overflow: hidden; height: 100%; }
        * { box-sizing: border-box; }
        @keyframes popIn { from{opacity:0;transform:scale(0.8)} to{opacity:1;transform:scale(1)} }
        @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
        @keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-3px)} 75%{transform:translateX(3px)} }
        @keyframes harvestPop { 0%{opacity:0;transform:translateY(0) scale(0.5)} 50%{opacity:1;transform:translateY(-28px) scale(1.2)} 100%{opacity:0;transform:translateY(-58px) scale(0.8)} }
        .plot-cell:hover { transform: scale(1.02); }
        .plot-ready { animation: bounce 1.3s infinite; }
        .plot-pest { animation: shake 0.45s infinite; }
      `}</style>

      {/* TOPBAR */}
      <div style={S.topbar}>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button style={S.backBtn} onClick={() => { saveGameState({plots, coins, seeds, score, streak, weather}); onBack(); }}>← Về nhà</button>
          <button style={S.resetBtn} onClick={resetGame}>🔄 Reset</button>
        </div>
        <div style={S.title}><span>🌾</span><span>Nông Trại Từ Vựng</span></div>
        <div style={S.statsRow}>
          <span style={S.statChip("#f59e0b")}>🪙 {coins}</span>
          <span style={S.statChip("#16a34a")}>🌱 {seeds}</span>
          <span style={S.statChip("#ef4444")}>🔥 {streak}</span>
        </div>
      </div>

      {notification && (
        <div style={{ position: "fixed", top: "68px", left: "50%", transform: "translateX(-50%)", background: notification.color, color: "white", padding: "8px 20px", borderRadius: "20px", fontWeight: "800", fontSize: "13px", zIndex: 9999, animation: "popIn 0.3s", whiteSpace: "nowrap" }}>{notification.text}</div>
      )}

      {/* WEATHER BAR - ĐÃ BỎ NÚT NGÀY TIẾP */}
      <div style={S.weatherBar}>
        <span>{w.emoji} <strong>{w.label}</strong> — {w.tip}</span>
      </div>

      {/* TABS */}
      <div style={S.tabBar}>
        {[
          { id: "farm", label: "🌾 Nông trại", color: "#16a34a" },
          { id: "quiz", label: "📝 Học từ",    color: "#1d4ed8" },
          { id: "shop", label: "🏪 Cửa hàng",  color: "#7c3aed" },
        ].map((tab) => (
          <button key={tab.id} className="tab-btn" style={S.tab(activePanel === tab.id, tab.color)} onClick={() => { if (tab.id === "quiz") startQuiz(null); else setActivePanel(tab.id); }}>{tab.label}</button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", gap: "6px", alignItems: "center" }}>
          {readyToHarvest > 0 && <span style={{ ...S.alertChip("#dcfce7", "#16a34a"), animation: "bounce 1s infinite" }}>🎉 {readyToHarvest} ô sẵn thu!</span>}
          {pestCount > 0 && <span style={{ ...S.alertChip("#fee2e2", "#dc2626"), animation: "shake 0.6s infinite" }}>🐛 {pestCount} ô có sâu!</span>}
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={S.main}>
        {activePanel === "farm" && (
          <div>
            <div>
              <div style={S.sectionLabel}>🌱 Chọn giống cây trồng:</div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {CROP_TYPES.map((crop) => (
                  <button key={crop.id} style={S.cropBtn(selectedCrop.id === crop.id, crop)} onClick={() => setSelectedCrop(crop)}>
                    {crop.emoji} {crop.name}
                    <span style={S.cropBadge}>(🪙{crop.reward} | ⏱{crop.growTime}s)</span>
                  </button>
                ))}
              </div>
            </div>

            <div style={S.grid}>
              {plots.map((plot) => {
                const crop = CROP_TYPES.find((c) => c.id === plot.crop);
                const isReady = plot.stage === 3;
                const hasPest = plot.hasPest;
                const isEmpty = plot.stage === 0;
                const emojiChar = cropEmoji(plot);
                const timeRemaining = plot.timeLeft;

                return (
                  <div key={plot.id} className={`plot-cell${isReady ? " plot-ready" : ""}${hasPest ? " plot-pest" : ""}`} style={S.plotCell(plot)} onClick={() => {
                    if (hasPest) { killPest(plot.id); return; }
                    if (isReady) { harvestPlot(plot.id); return; }
                    if (isEmpty) { if (seeds > 0) plantOnPlot(plot.id); else startQuiz(plot.id); return; }
                    if (plot.stage > 0 && plot.stage < 3) startQuiz(plot.id);
                  }}>
                    {showHarvest?.plotId === plot.id && (
                      <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", fontSize: "16px", fontWeight: "900", color: "#f59e0b", animation: "harvestPop 1.8s forwards", zIndex: 10, whiteSpace: "nowrap" }}>+{showHarvest.reward} 🪙</div>
                    )}
                    {isEmpty ? <div style={S.emptyPlotIcon}>🌱</div> : <span style={S.plotIcon}>{emojiChar}</span>}
                    {!isEmpty && !hasPest && crop && plot.stage > 0 && plot.stage < 3 && (
                      <div style={S.timerText}>⏳ {formatTime(timeRemaining)}</div>
                    )}
                    {plot.linkedWord && !hasPest && !isEmpty && <div style={S.linkedWordTag}>📝 {plot.linkedWord}</div>}
                    {isEmpty && <div style={{ fontSize: "9px", color: "#9ca3af", marginTop: "4px" }}>{seeds > 0 ? "Bấm để trồng" : "Quiz để nhận hạt"}</div>}
                    {isReady && <div style={S.plotLabel("#16a34a")}>🎉 Thu hoạch!</div>}
                    {hasPest && <div style={S.plotLabel("#dc2626")}>🐛 Diệt sâu!</div>}
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: "12px", marginTop: "18px", flexWrap: "wrap", justifyContent: "center" }}>
              {[
                { label: "Đã trồng", value: totalPlanted,   icon: "🌿", color: "#16a34a" },
                { label: "Sẵn thu",  value: readyToHarvest, icon: "🎉", color: "#f59e0b" },
                { label: "Có sâu",   value: pestCount,      icon: "🐛", color: "#ef4444" },
                { label: "Điểm",     value: score,          icon: "⭐", color: "#7c3aed" },
              ].map((s) => (
                <div key={s.label} style={{ background: "rgba(255,255,255,0.85)", borderRadius: "16px", padding: "8px 14px", textAlign: "center", flex: "1 1 70px", boxShadow: "0 1px 6px rgba(0,0,0,0.07)" }}>
                  <div style={{ fontSize: "16px" }}>{s.icon}</div>
                  <div style={{ fontSize: "20px", fontWeight: "900", color: s.color, lineHeight: 1.1 }}>{s.value}</div>
                  <div style={{ fontSize: "10px", color: "#9ca3af", fontWeight: "600" }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activePanel === "quiz" && question && (
          <div style={{ maxWidth: "480px", margin: "0 auto", width: "100%" }}>
            <div style={{ background: "rgba(255,255,255,0.9)", borderRadius: "18px", padding: "18px", textAlign: "center", marginBottom: "14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
                <span>🔥 Streak: <strong style={{ color: "#f59e0b" }}>{streak}</strong></span>
                <span style={{ color: timeLeft <= 5 ? "#ef4444" : "#374151" }}>⏱ {timeLeft}s</span>
              </div>
              <div style={{ width: "100%", height: "5px", background: "#e5e7eb", borderRadius: "5px", marginBottom: "14px" }}>
                <div style={{ width: `${(timeLeft / 15) * 100}%`, height: "100%", background: timeLeft <= 5 ? "#ef4444" : "#3b82f6", transition: "width 1s linear" }} />
              </div>
              <div style={{ fontSize: "13px", color: "#6b7280" }}>Nghĩa của từ là gì?</div>
              <div style={{ fontSize: "28px", fontWeight: "900", color: "#1e3a5f" }}>{question.word}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {question.options.map((opt, i) => {
                const state = answered ? (opt === question.answer ? "correct" : opt === chosenOpt ? "wrong" : null) : null;
                return (
                  <button key={i} disabled={answered} onClick={() => handleAnswer(opt)} style={{
                    background: state === "correct" ? "linear-gradient(135deg,#16a34a,#22c55e)" : state === "wrong" ? "linear-gradient(135deg,#dc2626,#ef4444)" : "rgba(255,255,255,0.88)",
                    color: state ? "white" : "#374151", border: "2px solid rgba(255,255,255,0.9)", borderRadius: "14px", padding: "12px 18px", fontSize: "14px", fontWeight: "700", cursor: state ? "default" : "pointer", textAlign: "left", fontFamily: "inherit"
                  }}>
                    <span style={{ opacity: 0.5, marginRight: "10px" }}>{["A","B","C","D"][i]}.</span> {opt}
                  </button>
                );
              })}
            </div>
            {answered && (
              <div style={{ marginTop: "14px", background: "rgba(255,255,255,0.9)", borderRadius: "14px", padding: "14px", textAlign: "center" }}>
                {chosenOpt === question.answer ? <div style={{ color: "#16a34a", fontWeight: "800" }}>✅ Chính xác! +1 🌱</div> : <div style={{ color: "#dc2626", fontWeight: "800" }}>❌ Đáp án đúng: <strong>{question.answer}</strong></div>}
                <button style={{ marginTop: "10px", background: "linear-gradient(135deg,#1d4ed8,#3b82f6)", color: "white", border: "none", borderRadius: "12px", padding: "10px 26px", fontWeight: "800", cursor: "pointer", fontSize: "14px" }} onClick={() => startQuiz(null)}>➡ Câu tiếp theo</button>
              </div>
            )}
          </div>
        )}

        {activePanel === "shop" && (
          <div style={{ maxWidth: "480px", margin: "0 auto", width: "100%" }}>
            <div style={{ background: "rgba(255,255,255,0.9)", borderRadius: "18px", padding: "18px", marginBottom: "14px", textAlign: "center" }}>
              <div style={{ fontSize: "28px" }}>🏪</div>
              <div style={{ fontSize: "18px", fontWeight: "900" }}>Cửa Hàng Nông Trại</div>
              <div style={{ color: "#6b7280", fontSize: "13px" }}>🪙 {coins} xu</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {SHOP_ITEMS.map((item) => (
                <div key={item.id} style={{ background: "rgba(255,255,255,0.9)", borderRadius: "16px", padding: "12px 16px", display: "flex", alignItems: "center", gap: "14px" }}>
                  <div style={{ fontSize: "32px", flexShrink: 0 }}>{item.emoji}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: "800", fontSize: "14px" }}>{item.name}</div>
                    <div style={{ fontSize: "12px", color: "#6b7280" }}>{item.desc}</div>
                  </div>
                  <button onClick={() => buyItem(item.id)} disabled={coins < item.price} style={{
                    background: coins >= item.price ? "linear-gradient(135deg,#f59e0b,#fbbf24)" : "#e5e7eb",
                    color: coins >= item.price ? "white" : "#9ca3af", border: "none", borderRadius: "12px", padding: "8px 16px", fontWeight: "800", cursor: coins >= item.price ? "pointer" : "not-allowed", fontSize: "13px"
                  }}>🪙 {item.price}</button>
                </div>
              ))}
            </div>
            <div style={{ marginTop: "14px", background: "rgba(255,255,255,0.9)", borderRadius: "16px", padding: "16px", textAlign: "center" }}>
              <div style={{ fontSize: "14px", fontWeight: "800" }}>🌱 Hạt giống: {seeds}</div>
              <div style={{ fontSize: "12px", color: "#6b7280" }}>Trả lời đúng để nhận thêm hạt!</div>
              <button style={{ marginTop: "10px", background: "linear-gradient(135deg,#16a34a,#22c55e)", color: "white", border: "none", borderRadius: "12px", padding: "10px 24px", fontWeight: "800", cursor: "pointer", fontSize: "13px" }} onClick={() => startQuiz(null)}>📝 Học từ nhận hạt</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}