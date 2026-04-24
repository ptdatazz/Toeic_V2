// ============================================================
// FARM VOCAB GAME - Phiên bản cao cấp
// (Thành tựu, Kim cương, Cấp độ, Mở rộng đất, Phân cấp vật phẩm)
// ============================================================

import { useState, useEffect, useRef } from "react";
import { db } from "./firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";

const DEFAULT_PLOT_COUNT = 3; // Bắt đầu với 3 ô
const MAX_PLOT_COUNT = 12;     // Tối đa 12 ô

// ===== BẢNG CẤP ĐỘ =====
const LEVEL_CONFIG = [
  { level: 1, expRequired: 0,   plotUnlock: 3,  unlockCost: 0 },      // Bắt đầu
  { level: 2, expRequired: 50,  plotUnlock: 4,  unlockCost: 50 },      // Mở ô thứ 4
  { level: 3, expRequired: 120, plotUnlock: 5,  unlockCost: 80 },      // Mở ô thứ 5
  { level: 4, expRequired: 200, plotUnlock: 6,  unlockCost: 100 },     // Mở ô thứ 6
  { level: 5, expRequired: 300, plotUnlock: 7,  unlockCost: 150 },     // Mở ô thứ 7
  { level: 6, expRequired: 450, plotUnlock: 8,  unlockCost: 200 },     // Mở ô thứ 8
  { level: 7, expRequired: 600, plotUnlock: 9,  unlockCost: 250 },     // Mở ô thứ 9
  { level: 8, expRequired: 800, plotUnlock: 10, unlockCost: 300 },     // Mở ô thứ 10
  { level: 9, expRequired: 1000, plotUnlock: 11, unlockCost: 400 },    // Mở ô thứ 11
  { level: 10, expRequired: 1300, plotUnlock: 12, unlockCost: 500 },   // Mở ô thứ 12
];

const CROP_TYPES = [
  { id: "wheat",      name: "Lúa mì",    emoji: "🌾", growTime: 30,   reward: 10, expReward: 5,  color: "#f59e0b" },
  { id: "carrot",     name: "Cà rốt",    emoji: "🥕", growTime: 45,   reward: 15, expReward: 8,  color: "#f97316" },
  { id: "strawberry", name: "Dâu tây",   emoji: "🍓", growTime: 60,   reward: 25, expReward: 12, color: "#ec4899" },
  { id: "corn",       name: "Ngô",       emoji: "🌽", growTime: 75,   reward: 30, expReward: 15, color: "#eab308" },
  { id: "watermelon", name: "Dưa hấu",   emoji: "🍉", growTime: 120,  reward: 50, expReward: 25, color: "#22c55e" },
];

const SHOP_ITEMS = [
  { id: "fertilizer_single", name: "Phân bón (1 ô)", emoji: "💊", price: 20, priceGem: 0, desc: "Cây mọc tức thì trên 1 ô", type: "single" },
  { id: "fertilizer_all",    name: "Phân bón (all)", emoji: "💊✨", price: 80, priceGem: 2, desc: "Cây mọc tức thì toàn bộ", type: "all" },
  { id: "pesticide_single",  name: "Thuốc sâu (1 ô)", emoji: "🧴", price: 15, priceGem: 0, desc: "Diệt sâu 1 ô", type: "single" },
  { id: "pesticide_all",     name: "Thuốc sâu (all)", emoji: "🧴✨", price: 60, priceGem: 1, desc: "Diệt sâu toàn bộ", type: "all" },
  { id: "rain_single",       name: "Mưa vàng (1 ô)", emoji: "🌧️", price: 30, priceGem: 0, desc: "Giảm 5s 1 cây", type: "single" },
  { id: "rain_all",          name: "Mưa vàng (all)", emoji: "🌧️✨", price: 120, priceGem: 3, desc: "Giảm 5s tất cả cây", type: "all" },
  { id: "exp_boost",         name: "Sách EXP", emoji: "📚", price: 200, priceGem: 5, desc: "Tăng 50 EXP", type: "single" },
];

const USABLE_ITEMS = ["fertilizer_single", "pesticide_single", "rain_single"];

const GROWTH_STAGES = [
  { stage: 0, label: "Đất trống",    emoji: "🟫" },
  { stage: 1, label: "Hạt giống",    emoji: "🌱" },
  { stage: 2, label: "Cây non",      emoji: "🌿" },
  { stage: 3, label: "Trưởng thành", emoji: "✨" },
];

const ACHIEVEMENTS = [
  { id: "first_harvest", name: "Mùa màng đầu tiên", desc: "Thu hoạch lần đầu", icon: "🌾", rewardGem: 5, condition: (s) => s.score >= 1 },
  { id: "harvest_10", name: "Nông dân chăm chỉ", desc: "Thu hoạch 10 cây", icon: "🌽", rewardGem: 10, condition: (s) => s.score >= 10 },
  { id: "harvest_50", name: "Chủ trang trại", desc: "Thu hoạch 50 cây", icon: "🚜", rewardGem: 25, condition: (s) => s.score >= 50 },
  { id: "streak_5", name: "Bất bại", desc: "Đạt Streak x5", icon: "⚡", rewardGem: 8, condition: (s) => s.streak >= 5 },
  { id: "streak_10", name: "Thần đồng", desc: "Đạt Streak x10", icon: "👑", rewardGem: 20, condition: (s) => s.streak >= 10 },
  { id: "rich_100", name: "Triệu phú", desc: "Sở hữu 100 xu", icon: "💰", rewardGem: 15, condition: (s) => s.coins >= 100 },
  { id: "rich_500", name: "Đại gia", desc: "Sở hữu 500 xu", icon: "💎", rewardGem: 40, condition: (s) => s.coins >= 500 },
  { id: "level_5", name: "Cao thủ", desc: "Đạt cấp độ 5", icon: "⭐", rewardGem: 25, condition: (s) => s.level >= 5 },
  { id: "level_10", name: "Bậc thầy", desc: "Đạt cấp độ 10", icon: "👑", rewardGem: 50, condition: (s) => s.level >= 10 },
  { id: "pest_killer", name: "Thợ săn sâu bọ", desc: "Diệt 10 con sâu", icon: "🔫", rewardGem: 10, condition: (s) => s.pestKilled >= 10 },
  { id: "word_master", name: "Từ vựng thông thái", desc: "Thu hoạch 20 từ vựng", icon: "📖", rewardGem: 20, condition: (s) => s.wordsMastered >= 20 },
];

const shuffleArray = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const getMeaning = (item) => {
  if (typeof item === 'string') return "???";
  if (item.meaning && item.meaning.trim()) return item.meaning.trim();
  const parts = [
    item.noun_meaning && `(n) ${item.noun_meaning}`,
    item.verb_meaning && `(v) ${item.verb_meaning}`,
    item.adj_meaning  && `(adj) ${item.adj_meaning}`,
  ].filter(Boolean);
  if (parts.length > 0) return parts.join(" / ");
  if (item.word && !item.meaning) return `(${item.word})`;
  return "???";
};

const genQuestionForWord = (wordObj) => {
  if (!wordObj) return null;
  const answer = getMeaning(wordObj);
  if (!answer || answer === "???") return null;
  
  const wrongPool = ["(n) sự vui vẻ", "(adj) nhanh chóng", "(v) phát triển", 
                     "(n) cơ hội", "(adj) quan trọng", "(v) hoàn thành",
                     "(n) kinh nghiệm", "(adj) khác nhau", "(v) đạt được"];
  const shuffledWrong = shuffleArray(wrongPool).slice(0, 3);
  
  return {
    word: wordObj.word,
    answer: answer,
    options: shuffleArray([answer, ...shuffledWrong]),
    wordData: wordObj
  };
};

export default function FarmGame({ onBack, vocabData = [], updateGlobal, onSaveWord, onMoveWord, stats, currentUser }) {
  // ===== STATE CƠ BẢN =====
  const [plots, setPlots] = useState([]);
  const [plotCount, setPlotCount] = useState(DEFAULT_PLOT_COUNT);
  const [coins, setCoins] = useState(50);
  const [gems, setGems] = useState(0);
  const [seeds, setSeeds] = useState(3);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [weather, setWeather] = useState("sunny");
  const [inventory, setInventory] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [remainingKills, setRemainingKills] = useState(0);
  const [lastStreakValue, setLastStreakValue] = useState(0);
  
  // ===== HỆ THỐNG CẤP ĐỘ =====
  const [level, setLevel] = useState(1);
  const [exp, setExp] = useState(0);
  const [nextLevelExp, setNextLevelExp] = useState(LEVEL_CONFIG[1]?.expRequired || 9999);
  
  // ===== THỐNG KÊ =====
  const [pestKilled, setPestKilled] = useState(0);
  const [wordsMastered, setWordsMastered] = useState(0);
  const [achievements, setAchievements] = useState([]);
  const [showAchievement, setShowAchievement] = useState(null);
  
  // ===== STATE UI =====
  const [selectedCrop, setSelectedCrop] = useState(CROP_TYPES[0]);
  const [activePanel, setActivePanel] = useState("farm");
  const [showHarvest, setShowHarvest] = useState(null);
  const [notification, setNotification] = useState(null);
  const [question, setQuestion] = useState(null);
  const [answered, setAnswered] = useState(false);
  const [chosenOpt, setChosenOpt] = useState(null);
  const [quizTarget, setQuizTarget] = useState(null);
  const [timeLeft, setTimeLeft] = useState(15);
  const timerRef = useRef(null);
  
  // ===== STATE CHO MỞ RỘNG ĐẤT =====
  const [showExpandModal, setShowExpandModal] = useState(false);
  
  // ===== STATE CHO SỬ DỤNG VẬT PHẨM =====
  const [showItemMenu, setShowItemMenu] = useState(false);
  const [selectedPlotForItem, setSelectedPlotForItem] = useState(null);
  const [selectedItemId, setSelectedItemId] = useState(null);
  
  const [availableWords, setAvailableWords] = useState([]);

  // ===== HÀM CẬP NHẬP CẤP ĐỘ =====
  const updateLevel = (newExp) => {
    const currentLevelConfig = LEVEL_CONFIG.find(l => l.level === level);
    let currentLevel = level;
    let currentExp = newExp;
    
    while (currentLevel < LEVEL_CONFIG.length && currentExp >= LEVEL_CONFIG[currentLevel].expRequired) {
      const nextLevelConfig = LEVEL_CONFIG[currentLevel];
      if (currentExp >= nextLevelConfig.expRequired) {
        currentExp -= nextLevelConfig.expRequired;
        currentLevel++;
        
        // Thông báo lên cấp
        notify(`🎉 CHÚC MỪNG! Lên cấp ${currentLevel}! 🎉`, "#8b5cf6");
        
        // Tự động mở rộng đất (nếu cấp độ cho phép mở thêm ô)
        const targetPlots = nextLevelConfig.plotUnlock;
        if (targetPlots > plotCount) {
          const newPlots = [...plots];
          for (let i = plots.length; i < targetPlots; i++) {
            newPlots.push({
              id: i, crop: null, stage: 0, hasPest: false,
              linkedWord: null, wordData: null, timeLeft: 0,
            });
          }
          setPlots(newPlots);
          setPlotCount(targetPlots);
          notify(`🌍 Đã mở rộng đất lên ${targetPlots} ô! (Không tốn kim cương)`, "#22c55e");
        }
      }
    }
    
    setLevel(currentLevel);
    setExp(currentExp);
    
    const nextExpNeeded = LEVEL_CONFIG[currentLevel]?.expRequired || 9999;
    setNextLevelExp(nextExpNeeded);
    
    checkAchievements({ level: currentLevel });
  };

  // ===== HÀM NHẬN EXP =====
  const addExp = (amount) => {
    const newExp = exp + amount;
    updateLevel(newExp);
  };

  // ===== KIỂM TRA THÀNH TỰU =====
  const checkAchievements = (stateUpdate) => {
    const currentState = {
      score, coins, streak, plotCount, pestKilled, wordsMastered, level,
      ...stateUpdate
    };
    
    const newlyUnlocked = [];
    
    ACHIEVEMENTS.forEach(ach => {
      if (!achievements.includes(ach.id) && ach.condition(currentState)) {
        newlyUnlocked.push(ach);
        setAchievements(prev => [...prev, ach.id]);
        setGems(prev => prev + ach.rewardGem);
        setShowAchievement(ach);
        setTimeout(() => setShowAchievement(null), 3000);
        notify(`🏆 Thành tựu: ${ach.name}! +${ach.rewardGem}💎`, "#8b5cf6");
      }
    });
  };

  // ===== TÍNH TOÁN MỞ RỘNG THỦ CÔNG (bằng xu) =====
  const canExpandManually = () => {
    const currentMaxPlots = LEVEL_CONFIG[level - 1]?.plotUnlock || DEFAULT_PLOT_COUNT;
    if (plotCount >= MAX_PLOT_COUNT) return null;
    if (plotCount >= currentMaxPlots) return null; // Đã đạt tối đa theo cấp
    
    const nextPlots = plotCount + 1;
    const levelConfig = LEVEL_CONFIG.find(l => l.plotUnlock === nextPlots);
    if (!levelConfig) return null;
    
    return {
      targetPlots: nextPlots,
      cost: levelConfig.unlockCost,
      requiredLevel: levelConfig.level
    };
  };
  
  const manualExpand = () => {
    const expandInfo = canExpandManually();
    if (!expandInfo) {
      if (plotCount >= MAX_PLOT_COUNT) notify("Đã đạt tối đa số ô đất!", "#ef4444");
      else notify("Cần lên cấp cao hơn để mở thêm ô!", "#ef4444");
      return;
    }
    
    if (expandInfo.requiredLevel > level) {
      notify(`Cần đạt cấp ${expandInfo.requiredLevel} để mở ô thứ ${expandInfo.targetPlots}!`, "#ef4444");
      return;
    }
    
    if (coins < expandInfo.cost) {
      notify(`Thiếu ${expandInfo.cost - coins}🪙 để mở rộng!`, "#ef4444");
      return;
    }
    
    setCoins(prev => prev - expandInfo.cost);
    setPlotCount(expandInfo.targetPlots);
    
    const newPlots = [...plots];
    for (let i = plots.length; i < expandInfo.targetPlots; i++) {
      newPlots.push({
        id: i, crop: null, stage: 0, hasPest: false,
        linkedWord: null, wordData: null, timeLeft: 0,
      });
    }
    setPlots(newPlots);
    notify(`🌍 Đã mở rộng đất lên ${expandInfo.targetPlots} ô! -${expandInfo.cost}🪙`, "#22c55e");
    setShowExpandModal(false);
    checkAchievements({ plotCount: expandInfo.targetPlots });
  };

  // ===== LOAD DỮ LIỆU =====
  useEffect(() => {
    const loadFarmData = async () => {
      if (!currentUser) {
        setIsLoading(false);
        return;
      }
      
      try {
        const userDocRef = doc(db, "users", currentUser.uid);
        const docSnap = await getDoc(userDocRef);
        
        if (docSnap.exists()) {
          const farmState = docSnap.data()?.farmState;
          if (farmState && farmState.plots) {
            setPlots(farmState.plots);
            setPlotCount(farmState.plotCount ?? DEFAULT_PLOT_COUNT);
            setCoins(farmState.coins ?? 50);
            setGems(farmState.gems ?? 0);
            setSeeds(farmState.seeds ?? 3);
            setScore(farmState.score ?? 0);
            setStreak(farmState.streak ?? 0);
            setWeather(farmState.weather ?? "sunny");
            setInventory(farmState.inventory ?? {});
            setRemainingKills(farmState.remainingKills ?? 0);
            setLastStreakValue(farmState.streak ?? 0);
            setPestKilled(farmState.pestKilled ?? 0);
            setWordsMastered(farmState.wordsMastered ?? 0);
            setAchievements(farmState.achievements ?? []);
            setLevel(farmState.level ?? 1);
            setExp(farmState.exp ?? 0);
          } else {
            const newPlots = Array.from({ length: DEFAULT_PLOT_COUNT }, (_, i) => ({
              id: i, crop: null, stage: 0, hasPest: false, 
              linkedWord: null, wordData: null, timeLeft: 0,
            }));
            setPlots(newPlots);
            setPlotCount(DEFAULT_PLOT_COUNT);
          }
        }
        
        const userData = docSnap.data();
        const savedWords = userData?.vocab?.savedWords || [];
        const addedWordsObj = userData?.vocab?.addedWordsObj || [];
        
        const wordList = [];
        const seen = new Set();
        
        addedWordsObj.forEach(item => {
          if (item.word && !seen.has(item.word.toLowerCase())) {
            seen.add(item.word.toLowerCase());
            wordList.push(item);
          }
        });
        
        savedWords.forEach(word => {
          const wordStr = typeof word === 'string' ? word : word.word;
          if (wordStr && !seen.has(wordStr.toLowerCase())) {
            seen.add(wordStr.toLowerCase());
            wordList.push({ word: wordStr, meaning: "???" });
          }
        });
        
        setAvailableWords(wordList);
        
      } catch (error) {
        console.error("Lỗi load dữ liệu:", error);
      }
      setIsLoading(false);
    };
    
    loadFarmData();
  }, [currentUser]);

  // ===== TỰ ĐỘNG LƯU =====
  useEffect(() => {
    if (!currentUser || isLoading || plots.length === 0) return;
    
    const saveTimeout = setTimeout(async () => {
      try {
        const farmState = {
          plots, plotCount, coins, gems, seeds, score, streak, weather, 
          inventory, remainingKills, pestKilled, wordsMastered, achievements,
          level, exp,
          lastSaved: Date.now()
        };
        const userDocRef = doc(db, "users", currentUser.uid);
        await updateDoc(userDocRef, { farmState });
      } catch (error) {
        console.error("Lỗi lưu lên Firebase:", error);
      }
    }, 1000);
    
    return () => clearTimeout(saveTimeout);
  }, [plots, plotCount, coins, gems, seeds, score, streak, weather, 
      inventory, remainingKills, pestKilled, wordsMastered, achievements, level, exp, currentUser, isLoading]);

  // ===== THEO DÕI STREAK =====
  useEffect(() => {
    if (streak >= 3 && lastStreakValue < 3) {
      const hasAnyPest = plots.some(plot => plot.hasPest);
      if (hasAnyPest) {
        setPlots(prev => prev.map(plot => ({ ...plot, hasPest: false })));
        notify(`✨ Đạt Streak x${streak}! Toàn bộ sâu đã bị tiêu diệt! ✨`, "#8b5cf6");
      }
      setRemainingKills(2);
    } else if (streak >= 3 && streak > lastStreakValue) {
      setRemainingKills(2);
      notify(`🔥 Streak tăng lên x${streak}! Bạn có 2 lượt diệt sâu!`, "#f59e0b");
    }
    setLastStreakValue(streak);
    checkAchievements({ streak });
  }, [streak]);

  // ===== TIMER =====
  useEffect(() => {
    if (activePanel !== "quiz" || answered || !question) return;
    setTimeLeft(15);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          handleAnswer(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [question, activePanel, answered]);

  useEffect(() => {
    const interval = setInterval(() => {
      setPlots(prev => prev.map(plot => {
        if (plot.stage === 0 || plot.stage === 3) return plot;
        if (plot.hasPest) return plot;
        const newTimeLeft = Math.max(0, (plot.timeLeft || 0) - 1);
        const crop = CROP_TYPES.find(c => c.id === plot.crop);
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

  useEffect(() => {
    const pestInterval = setInterval(() => {
      setPlots(prev => prev.map(plot => {
        if ((plot.stage === 1 || plot.stage === 2) && !plot.hasPest && Math.random() < 0.15) {
          return { ...plot, hasPest: true };
        }
        return plot;
      }));
    }, 5000);
    return () => clearInterval(pestInterval);
  }, []);

  const notify = (text, color = "#22c55e") => {
    setNotification({ text, color });
    setTimeout(() => setNotification(null), 2200);
  };

  const plantOnPlot = (plotId) => {
    if (seeds <= 0) { notify("Hết hạt giống! Trả lời đúng để nhận thêm 🌱", "#ef4444"); return; }
    if (availableWords.length === 0) {
      notify("📖 Không có từ trong Ô vàng! Hãy học và lưu từ mới nhé!", "#ef4444");
      return;
    }
    const randomWord = availableWords[Math.floor(Math.random() * availableWords.length)];
    const crop = selectedCrop;
    setPlots((prev) =>
      prev.map((p) =>
        p.id === plotId ? { 
          ...p, crop: crop.id, stage: 1, hasPest: false, 
          linkedWord: randomWord.word, wordData: randomWord, timeLeft: crop.growTime
        } : p
      )
    );
    setSeeds((s) => s - 1);
    notify(`🌱 Đã trồng ${crop.name} với từ "${randomWord.word}"!`, "#22c55e");
  };

  const harvestPlot = (plotId) => {
    const plot = plots.find((p) => p.id === plotId);
    if (!plot || plot.stage !== 3) return;
    if (streak < 4) {
      notify(`🔒 Cần đạt Streak x4 mới được thu hoạch! Hiện tại: x${streak}`, "#ef4444");
      return;
    }
    if (!plot.wordData) {
      notify("❌ Cây này chưa được gán từ vựng!", "#ef4444");
      return;
    }
    const q = genQuestionForWord(plot.wordData);
    if (!q) {
      notify("❌ Không thể tạo câu hỏi cho từ này!", "#ef4444");
      return;
    }
    setQuestion(q);
    setAnswered(false);
    setChosenOpt(null);
    setQuizTarget(plotId);
    setActivePanel("quiz");
  };

  const handleHarvestSuccess = (plotId, wordData) => {
    const plot = plots.find((p) => p.id === plotId);
    if (!plot) return;
    const crop = CROP_TYPES.find((c) => c.id === plot.crop);
    const reward = crop ? crop.reward : 10;
    const expReward = crop ? crop.expReward : 5;
    const bonus = weather === "rainy" ? Math.floor(reward * 0.5) : 0;
    const total = reward + bonus;
    
    setCoins((c) => c + total);
    setSeeds((s) => s + 1);
    setScore((sc) => sc + 1);
    setWordsMastered(prev => prev + 1);
    
    // NHẬN EXP
    addExp(expReward);
    
    setPlots((prev) =>
      prev.map((p) =>
        p.id === plotId ? { ...p, crop: null, stage: 0, hasPest: false, linkedWord: null, wordData: null, timeLeft: 0 } : p
      )
    );
    
    if (onMoveWord && wordData) {
      onMoveWord("vocab", "savedWords", "masteredWords", wordData);
      setAvailableWords(prev => prev.filter(w => w.word !== wordData.word));
    }
    
    setShowHarvest({ plotId, reward: total, bonus, exp: expReward });
    setTimeout(() => setShowHarvest(null), 1800);
    notify(`🎉 Thu hoạch thành công! +${total}🪙 +${expReward} EXP. Từ "${wordData.word}" đã chuyển vào Ô xanh!`, "#f59e0b");
    checkAchievements({ score: score + 1, wordsMastered: wordsMastered + 1, coins: coins + total });
  };

  const startQuiz = (targetPlotId = null) => {
    if (!vocabData || vocabData.length < 4) { 
      notify("Cần ít nhất 4 từ vựng để chơi!", "#ef4444"); 
      return; 
    }
    const shuffled = shuffleArray(vocabData);
    const item = shuffled[0];
    const wrongPool = shuffled.slice(1, 4).map((w) => getMeaning(w));
    const answer = getMeaning(item);
    const options = shuffleArray([answer, ...wrongPool]);
    const q = { word: item.word, answer, options, item };
    if (!q) return;
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
        const targetPlot = plots.find(p => p.id === quizTarget);
        if (targetPlot && targetPlot.stage === 3 && targetPlot.wordData) {
          handleHarvestSuccess(quizTarget, targetPlot.wordData);
        }
      }
      if (updateGlobal) updateGlobal("vocab", true, question.word);
      notify(newStreak >= 3 ? `🔥 x${newStreak} COMBO! +${bonus} 🌱` : "✅ Đúng rồi! +1 🌱");
    } else {
      setStreak(0);
      setRemainingKills(0);
      if (updateGlobal) updateGlobal("vocab", false, question.word);
      notify("❌ Sai rồi! Cây có thể bị sâu...", "#ef4444");
      if (quizTarget !== null && Math.random() < 0.4) {
        setPlots((prev) =>
          prev.map((p) => (p.id === quizTarget && p.stage >= 1 ? { ...p, hasPest: true } : p))
        );
      }
    }
    if (quizTarget !== null) setQuizTarget(null);
  };

  const killPest = (plotId) => {
    if (streak < 3) {
      notify(`🔒 Cần đạt Streak x3 mới được diệt sâu! Hiện tại: x${streak}`, "#ef4444");
      startQuiz(plotId);
      return;
    }
    if (remainingKills <= 0) {
      notify(`⚠️ Hết lượt diệt sâu! Hãy tăng streak lên để nhận thêm lượt.`, "#ef4444");
      return;
    }
    setPlots((prev) => prev.map((p) => (p.id === plotId ? { ...p, hasPest: false } : p)));
    setRemainingKills(prev => prev - 1);
    setPestKilled(prev => prev + 1);
    notify(`✅ Đã diệt sâu! Còn ${remainingKills - 1} lượt`, "#22c55e");
    checkAchievements({ pestKilled: pestKilled + 1 });
  };

  const buyItem = (itemId) => {
    const item = SHOP_ITEMS.find((i) => i.id === itemId);
    if (!item) return;
    
    const canBuyCoin = item.price > 0 && coins >= item.price;
    const canBuyGem = item.priceGem > 0 && gems >= item.priceGem;
    
    if (!canBuyCoin && !canBuyGem) {
      notify(`Không đủ ${item.price > 0 ? `${item.price}🪙 ` : ""}${item.priceGem > 0 ? `${item.priceGem}💎 ` : ""}!`, "#ef4444");
      return;
    }
    
    if (item.price > 0) setCoins(prev => prev - item.price);
    if (item.priceGem > 0) setGems(prev => prev - item.priceGem);
    
    // Xử lý đặc biệt cho sách EXP
    if (itemId === "exp_boost") {
      addExp(50);
      notify(`📚 Sử dụng sách EXP! +50 EXP`, "#8b5cf6");
      return;
    }
    
    setInventory(prev => ({ ...prev, [itemId]: (prev[itemId] || 0) + 1 }));
    notify(`✅ Đã mua 1 ${item.name}!`, "#22c55e");
  };

  const openItemMenu = (itemId) => {
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return;
    
    if (item.type === "all") {
      useItemOnAll(itemId);
    } else {
      setSelectedItemId(itemId);
      setShowItemMenu(true);
      notify(`Chọn ô đất để sử dụng ${item.name}`, "#8b5cf6");
    }
  };

  const useItemOnPlot = (plotId, itemId) => {
    const plot = plots.find(p => p.id === plotId);
    if (!plot) return;
    
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return;
    
    if (inventory[itemId] <= 0) {
      notify(`Không còn ${item.name} trong kho!`, "#ef4444");
      return;
    }
    
    setInventory(prev => ({ ...prev, [itemId]: prev[itemId] - 1 }));
    
    if (itemId === "fertilizer_single") {
      if (plot.stage >= 1 && plot.stage < 3 && !plot.hasPest) {
        const newStage = Math.min(3, plot.stage + 1);
        setPlots(prev => prev.map(p => p.id === plotId ? { ...p, stage: newStage, timeLeft: newStage === 3 ? 0 : (CROP_TYPES.find(c => c.id === p.crop)?.growTime || 10) } : p));
        notify(`💊 Đã xài phân bón cho ô ${plotId + 1}! Cây lớn thêm 1 tầng!`, "#22c55e");
      } else {
        notify(`❌ Không thể dùng phân bón cho ô này!`, "#ef4444");
      }
    } else if (itemId === "pesticide_single") {
      if (plot.hasPest) {
        setPlots(prev => prev.map(p => p.id === plotId ? { ...p, hasPest: false } : p));
        setPestKilled(prev => prev + 1);
        notify(`🧴 Đã xài thuốc sâu cho ô ${plotId + 1}!`, "#22c55e");
        checkAchievements({ pestKilled: pestKilled + 1 });
      } else {
        notify(`❌ Ô này không có sâu!`, "#ef4444");
      }
    } else if (itemId === "rain_single") {
      if (plot.stage >= 1 && plot.stage < 3 && !plot.hasPest) {
        const newTimeLeft = Math.max(0, (plot.timeLeft || 0) - 5);
        setPlots(prev => prev.map(p => p.id === plotId ? { ...p, timeLeft: newTimeLeft } : p));
        notify(`🌧️ Đã xài mưa vàng cho ô ${plotId + 1}! Giảm 5s chờ!`, "#22c55e");
      } else {
        notify(`❌ Không thể dùng mưa vàng cho ô này!`, "#ef4444");
      }
    }
    
    setShowItemMenu(false);
    setSelectedItemId(null);
    setSelectedPlotForItem(null);
  };

  const useItemOnAll = (itemId) => {
    if (inventory[itemId] <= 0) {
      notify(`Không còn vật phẩm trong kho!`, "#ef4444");
      return;
    }
    
    setInventory(prev => ({ ...prev, [itemId]: prev[itemId] - 1 }));
    
    if (itemId === "fertilizer_all") {
      setPlots(prev => prev.map(p => {
        if (p.stage >= 1 && p.stage < 3 && !p.hasPest) {
          const newStage = Math.min(3, p.stage + 1);
          return { ...p, stage: newStage, timeLeft: newStage === 3 ? 0 : (CROP_TYPES.find(c => c.id === p.crop)?.growTime || 10) };
        }
        return p;
      }));
      notify("💊✨ Đã xài phân bón toàn bộ! Tất cả cây lớn thêm 1 tầng!", "#22c55e");
    } else if (itemId === "pesticide_all") {
      setPlots(prev => prev.map(p => ({ ...p, hasPest: false })));
      notify("🧴✨ Đã xài thuốc sâu toàn bộ! Diệt sạch sâu bọ!", "#22c55e");
    } else if (itemId === "rain_all") {
      setPlots(prev => prev.map(p => {
        if (p.stage >= 1 && p.stage < 3 && !p.hasPest) {
          return { ...p, timeLeft: Math.max(0, (p.timeLeft || 0) - 5) };
        }
        return p;
      }));
      notify("🌧️✨ Đã xài mưa vàng toàn bộ! Tất cả cây giảm 5s chờ!", "#22c55e");
    }
  };

  const resetGame = async () => {
    if (window.confirm("⚠️ Bạn có chắc muốn RESET nông trại? Tất cả dữ liệu sẽ bị mất!")) {
      const newPlots = Array.from({ length: DEFAULT_PLOT_COUNT }, (_, i) => ({
        id: i, crop: null, stage: 0, hasPest: false, linkedWord: null, wordData: null, timeLeft: 0,
      }));
      setPlots(newPlots);
      setPlotCount(DEFAULT_PLOT_COUNT);
      setCoins(50);
      setGems(0);
      setSeeds(3);
      setScore(0);
      setStreak(0);
      setRemainingKills(0);
      setLastStreakValue(0);
      setWeather("sunny");
      setInventory({});
      setPestKilled(0);
      setWordsMastered(0);
      setAchievements([]);
      setLevel(1);
      setExp(0);
      setNextLevelExp(LEVEL_CONFIG[1]?.expRequired || 9999);
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
  const expProgress = (exp / nextLevelExp) * 100;

  const formatTime = (seconds) => {
    if (!seconds || seconds <= 0) return "0s";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}p${secs}s` : `${secs}s`;
  };

  const expandInfo = canExpandManually();

  if (isLoading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "40px", marginBottom: "10px" }}>🌾</div>
          <div style={{ fontSize: "16px", color: "#666" }}>Đang tải nông trại...</div>
        </div>
      </div>
    );
  }

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
    statsRow: { display: "flex", gap: "14px", alignItems: "center", flexWrap: "wrap" },
    statChip: (color, bg = "transparent") => ({ 
      fontWeight: "800", fontSize: "14px", color, 
      display: "flex", alignItems: "center", gap: "3px",
      background: bg, padding: "2px 8px", borderRadius: "20px"
    }),
    weatherBar: {
      background: "rgba(255,255,255,0.55)", backdropFilter: "blur(8px)",
      padding: "5px 20px", display: "flex", alignItems: "center",
      justifyContent: "space-between", fontSize: "13px", color: "#374151",
      borderBottom: "1px solid rgba(0,0,0,0.06)", flexShrink: 0,
    },
    expandBtn: {
      background: "linear-gradient(135deg,#8b5cf6,#7c3aed)", color: "white",
      border: "none", borderRadius: "20px", padding: "4px 12px",
      fontWeight: "700", fontSize: "12px", cursor: "pointer",
      fontFamily: "inherit",
    },
    levelBar: {
      background: "rgba(0,0,0,0.1)", borderRadius: "10px", height: "6px",
      width: "100px", overflow: "hidden",
    },
    levelFill: {
      background: "linear-gradient(90deg,#8b5cf6,#c084fc)", height: "100%",
      borderRadius: "10px", transition: "width 0.3s",
    },
    tabBar: {
      display: "flex", gap: "8px", padding: "7px 20px",
      background: "rgba(255,255,255,0.45)", flexShrink: 0, alignItems: "center", flexWrap: "wrap",
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
      gridTemplateColumns: `repeat(${Math.min(3, plotCount)}, 1fr)`,
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
    itemMenuOverlay: {
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
    },
    itemMenuBox: {
      background: "white", borderRadius: "20px", padding: "20px",
      width: "90%", maxWidth: "350px", textAlign: "center",
    },
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
        .achievement-toast {
          position: fixed; top: 80px; left: 50%; transform: translateX(-50%);
          background: linear-gradient(135deg,#8b5cf6,#7c3aed);
          color: white; padding: 12px 24px; border-radius: 40px;
          font-weight: bold; z-index: 10000; animation: popIn 0.3s;
          display: flex; align-items: center; gap: 10px;
          box-shadow: 0 4px 20px rgba(139,92,246,0.4);
        }
      `}</style>

      {showAchievement && (
        <div className="achievement-toast">
          <span style={{ fontSize: "24px" }}>{showAchievement.icon}</span>
          <div>
            <div>🏆 {showAchievement.name}</div>
            <div style={{ fontSize: "11px", opacity: 0.9 }}>+{showAchievement.rewardGem}💎</div>
          </div>
        </div>
      )}

      <div style={S.topbar}>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button style={S.backBtn} onClick={onBack}>← Về nhà</button>
          <button style={S.resetBtn} onClick={resetGame}>🔄 Reset</button>
        </div>
        <div style={S.title}><span>🌾</span><span>Nông Trại Cao Cấp</span></div>
        <div style={S.statsRow}>
          <span style={S.statChip("#f59e0b")}>🪙 {coins}</span>
          <span style={S.statChip("#eab308", "#fef3c7")}>💎 {gems}</span>
          <span style={S.statChip("#16a34a")}>🌱 {seeds}</span>
          <span style={S.statChip("#ef4444")}>🔥 {streak}</span>
          {remainingKills > 0 && <span style={S.statChip("#8b5cf6")}>⚔️ {remainingKills}</span>}
        </div>
      </div>

      {notification && (
        <div style={{ position: "fixed", top: "68px", left: "50%", transform: "translateX(-50%)", background: notification.color, color: "white", padding: "8px 20px", borderRadius: "20px", fontWeight: "800", fontSize: "13px", zIndex: 9999, animation: "popIn 0.3s", whiteSpace: "nowrap" }}>{notification.text}</div>
      )}

      <div style={S.weatherBar}>
        <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span>{w.emoji} <strong>{w.label}</strong> — {w.tip}</span>
          <span style={{ background: "#f3e8ff", padding: "4px 12px", borderRadius: "20px", display: "flex", alignItems: "center", gap: "6px" }}>
            <span>⭐ Cấp {level}</span>
            <div style={S.levelBar}>
              <div style={{ ...S.levelFill, width: `${expProgress}%` }} />
            </div>
            <span style={{ fontSize: "11px" }}>{exp}/{nextLevelExp}</span>
          </span>
        </span>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <span style={{ color: "#9ca3af" }}>📚 Từ Ô vàng: {availableWords.length}</span>
          {expandInfo && (
            <button style={S.expandBtn} onClick={() => setShowExpandModal(true)}>
              🌍 Mở rộng ({plotCount}→{expandInfo.targetPlots}) {expandInfo.cost}🪙
            </button>
          )}
        </div>
      </div>

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

      <div style={S.main}>
        {activePanel === "farm" && (
          <div>
            <div>
              <div style={S.sectionLabel}>🌱 Chọn giống cây trồng:</div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {CROP_TYPES.map((crop) => (
                  <button key={crop.id} style={S.cropBtn(selectedCrop.id === crop.id, crop)} onClick={() => setSelectedCrop(crop)}>
                    {crop.emoji} {crop.name}
                    <span style={S.cropBadge}>(🪙{crop.reward} | +{crop.expReward}EXP | ⏱{crop.growTime}s)</span>
                  </button>
                ))}
              </div>
              {availableWords.length === 0 && (
                <div style={{ marginTop: "10px", padding: "8px", background: "#fff3cd", borderRadius: "8px", color: "#856404", fontSize: "12px" }}>
                  ⚠️ Không có từ nào trong Ô vàng! Hãy vào Sổ tay để thêm từ vựng nhé!
                </div>
              )}
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
                    if (isEmpty) { if (seeds > 0 && availableWords.length > 0) plantOnPlot(plot.id); else if (availableWords.length === 0) notify("📖 Không có từ trong Ô vàng!", "#ef4444"); else startQuiz(plot.id); return; }
                    if (plot.stage > 0 && plot.stage < 3) startQuiz(plot.id);
                  }}>
                    {showHarvest?.plotId === plot.id && (
                      <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", fontSize: "16px", fontWeight: "900", color: "#f59e0b", animation: "harvestPop 1.8s forwards", zIndex: 10, whiteSpace: "nowrap" }}>+{showHarvest.reward}🪙 +{showHarvest.exp}EXP</div>
                    )}
                    {isEmpty ? <div style={S.emptyPlotIcon}>🌱</div> : <span style={S.plotIcon}>{emojiChar}</span>}
                    {!isEmpty && !hasPest && crop && plot.stage > 0 && plot.stage < 3 && (
                      <div style={S.timerText}>⏳ {formatTime(timeRemaining)}</div>
                    )}
                    {plot.linkedWord && !hasPest && !isEmpty && (
                      <div style={S.linkedWordTag}>📖 {plot.linkedWord}</div>
                    )}
                    {isEmpty && <div style={{ fontSize: "9px", color: "#9ca3af", marginTop: "4px" }}>{seeds > 0 && availableWords.length > 0 ? "Bấm để trồng" : "Quiz để nhận hạt"}</div>}
                    {isReady && (
                      <>
                        <div style={S.plotLabel("#16a34a")}>🎉 Thu hoạch!</div>
                        <div style={{ fontSize: "9px", color: "#f59e0b", marginTop: "2px" }}>🔓 Cần Streak x4 | +{crop?.expReward}EXP</div>
                      </>
                    )}
                    {hasPest && <div style={S.plotLabel("#dc2626")}>🐛 Diệt sâu!</div>}
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: "12px", marginTop: "18px", flexWrap: "wrap", justifyContent: "center" }}>
              {[
                { label: "Đã trồng", value: totalPlanted, icon: "🌿", color: "#16a34a" },
                { label: "Sẵn thu",  value: readyToHarvest, icon: "🎉", color: "#f59e0b" },
                { label: "Có sâu",   value: pestCount, icon: "🐛", color: "#ef4444" },
                { label: "Điểm",     value: score, icon: "⭐", color: "#7c3aed" },
                { label: "Thành tựu", value: achievements.length, icon: "🏆", color: "#8b5cf6" },
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
              <div style={{ fontSize: "13px", color: "#6b7280" }}>
                {quizTarget !== null ? "🎯 Thu hoạch cây! Nghĩa của từ là gì?" : "Nghĩa của từ là gì?"}
              </div>
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
          <div style={{ maxWidth: "550px", margin: "0 auto", width: "100%" }}>
            <div style={{ background: "rgba(255,255,255,0.9)", borderRadius: "18px", padding: "18px", marginBottom: "14px", textAlign: "center" }}>
              <div style={{ fontSize: "24px" }}>🏪 Cửa Hàng</div>
              <div style={{ display: "flex", justifyContent: "center", gap: "20px", marginBottom: "12px" }}>
                <span style={{ color: "#f59e0b", fontWeight: "bold" }}>🪙 {coins} xu</span>
                <span style={{ color: "#eab308", fontWeight: "bold", background: "#fef3c7", padding: "2px 12px", borderRadius: "20px" }}>💎 {gems}</span>
              </div>
              
              <div style={{ fontSize: "14px", fontWeight: "bold", marginBottom: "10px", color: "#7c3aed" }}>✨ Vật phẩm phổ thông (mua bằng xu)</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
                {SHOP_ITEMS.filter(i => i.priceGem === 0).map((item) => (
                  <div key={item.id} style={{ display: "flex", alignItems: "center", gap: "12px", background: "#f8f9fa", borderRadius: "12px", padding: "10px 12px" }}>
                    <div style={{ fontSize: "28px" }}>{item.emoji}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: "bold", fontSize: "14px" }}>{item.name}</div>
                      <div style={{ fontSize: "11px", color: "#666" }}>{item.desc}</div>
                    </div>
                    <button onClick={() => buyItem(item.id)} disabled={coins < item.price} style={{
                      background: coins >= item.price ? "linear-gradient(135deg,#f59e0b,#fbbf24)" : "#ccc",
                      color: "white", border: "none", borderRadius: "20px", padding: "6px 16px",
                      fontWeight: "bold", cursor: coins >= item.price ? "pointer" : "not-allowed"
                    }}>🪙 {item.price}</button>
                  </div>
                ))}
              </div>

              <div style={{ fontSize: "14px", fontWeight: "bold", marginBottom: "10px", color: "#eab308" }}>💎 Vật phẩm cao cấp (mua bằng kim cương)</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {SHOP_ITEMS.filter(i => i.priceGem > 0).map((item) => (
                  <div key={item.id} style={{ display: "flex", alignItems: "center", gap: "12px", background: "linear-gradient(135deg,#fff3e0,#fff8f0)", borderRadius: "12px", padding: "10px 12px", border: "1px solid #ffe0b2" }}>
                    <div style={{ fontSize: "28px" }}>{item.emoji}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: "bold", fontSize: "14px" }}>{item.name}</div>
                      <div style={{ fontSize: "11px", color: "#666" }}>{item.desc}</div>
                    </div>
                    <button onClick={() => buyItem(item.id)} disabled={gems < item.priceGem} style={{
                      background: gems >= item.priceGem ? "linear-gradient(135deg,#eab308,#f59e0b)" : "#ccc",
                      color: "white", border: "none", borderRadius: "20px", padding: "6px 16px",
                      fontWeight: "bold", cursor: gems >= item.priceGem ? "pointer" : "not-allowed"
                    }}>💎 {item.priceGem}</button>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: "rgba(255,255,255,0.9)", borderRadius: "18px", padding: "18px", marginBottom: "14px" }}>
              <div style={{ fontSize: "20px", textAlign: "center", marginBottom: "12px" }}>📦 Kho Đồ Của Bạn</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {SHOP_ITEMS.filter(item => inventory[item.id] > 0).map((item) => {
                  const count = inventory[item.id] || 0;
                  return (
                    <div key={item.id} style={{ display: "flex", alignItems: "center", gap: "12px", background: "#f8f9fa", borderRadius: "12px", padding: "10px 12px" }}>
                      <div style={{ fontSize: "28px" }}>{item.emoji}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: "bold", fontSize: "14px" }}>{item.name}</div>
                        <div style={{ fontSize: "12px", color: "#4CAF50" }}>Số lượng: {count}</div>
                      </div>
                      <button onClick={() => USABLE_ITEMS.includes(item.id) ? openItemMenu(item.id) : useItemOnAll(item.id)} style={{
                        background: "linear-gradient(135deg,#2196F3,#42a5f5)", color: "white", border: "none", borderRadius: "20px", padding: "6px 16px", fontWeight: "bold", cursor: "pointer"
                      }}>✨ {USABLE_ITEMS.includes(item.id) ? "Chọn ô" : "Xài tất cả"}</button>
                    </div>
                  );
                })}
              </div>
              {Object.keys(inventory).filter(k => inventory[k] > 0).length === 0 && (
                <p style={{ textAlign: "center", color: "#999", fontSize: "12px" }}>🛒 Chưa có gì. Mua đồ ở cửa hàng nhé!</p>
              )}
            </div>

            <div style={{ background: "rgba(255,255,255,0.9)", borderRadius: "16px", padding: "16px", textAlign: "center" }}>
              <div style={{ fontSize: "14px", fontWeight: "800" }}>🌱 Hạt giống: {seeds}</div>
              <div style={{ fontSize: "12px", color: "#6b7280" }}>Trả lời đúng để nhận thêm hạt!</div>
              <button style={{ marginTop: "10px", background: "linear-gradient(135deg,#16a34a,#22c55e)", color: "white", border: "none", borderRadius: "12px", padding: "10px 24px", fontWeight: "800", cursor: "pointer", fontSize: "13px" }} onClick={() => startQuiz(null)}>📝 Học từ nhận hạt</button>
            </div>
          </div>
        )}
      </div>

      {/* Modal mở rộng đất (bằng xu) */}
      {showExpandModal && expandInfo && (
        <div onClick={() => setShowExpandModal(false)} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: "20px", padding: "24px", width: "90%", maxWidth: "320px", textAlign: "center" }}>
            <div style={{ fontSize: "48px", marginBottom: "10px" }}>🌍</div>
            <h3 style={{ margin: "0 0 10px 0" }}>Mở rộng đất đai</h3>
            <p>Mở rộng từ <strong>{plotCount}</strong> lên <strong>{expandInfo.targetPlots}</strong> ô</p>
            <div style={{ background: "#f3f4f6", padding: "12px", borderRadius: "12px", margin: "15px 0" }}>
              <div>💰 Chi phí: <strong style={{ color: "#f59e0b" }}>{expandInfo.cost}🪙</strong></div>
              <div style={{ fontSize: "12px", color: "#666", marginTop: "5px" }}>💎 Không tốn kim cương (mở bằng cấp độ)</div>
            </div>
            <div style={{ display: "flex", gap: "12px" }}>
              <button onClick={() => setShowExpandModal(false)} style={{ flex: 1, padding: "10px", background: "#e0e0e0", border: "none", borderRadius: "10px", cursor: "pointer" }}>Hủy</button>
              <button onClick={manualExpand} style={{ flex: 1, padding: "10px", background: "linear-gradient(135deg,#f59e0b,#fbbf24)", color: "white", border: "none", borderRadius: "10px", cursor: "pointer" }}>Mở rộng</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal chọn ô để dùng vật phẩm */}
      {showItemMenu && selectedItemId && (
        <div onClick={() => { setShowItemMenu(false); setSelectedItemId(null); }} style={S.itemMenuOverlay}>
          <div onClick={e => e.stopPropagation()} style={S.itemMenuBox}>
            <div style={{ fontSize: "32px", marginBottom: "10px" }}>🎯</div>
            <h3 style={{ margin: "0 0 10px 0" }}>Chọn ô đất để dùng</h3>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(3, plotCount)}, 1fr)`, gap: "10px", marginBottom: "20px" }}>
              {plots.map((plot, idx) => (
                <button key={plot.id} onClick={() => useItemOnPlot(plot.id, selectedItemId)} style={{
                  padding: "15px 5px", background: plot.stage === 0 ? "#f0f0f0" : plot.stage === 3 ? "#d1fae5" : "#e3f2fd",
                  border: "2px solid #ccc", borderRadius: "10px", cursor: "pointer"
                }}>
                  <div>Ô {idx + 1}</div>
                  <div style={{ fontSize: "20px" }}>{plot.stage === 0 ? "🟫" : plot.stage === 3 ? "🌾" : "🌱"}</div>
                </button>
              ))}
            </div>
            <button onClick={() => { setShowItemMenu(false); setSelectedItemId(null); }} style={{ width: "100%", padding: "10px", background: "#e0e0e0", border: "none", borderRadius: "10px", cursor: "pointer" }}>Hủy</button>
          </div>
        </div>
      )}
    </div>
  );
}