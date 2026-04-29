// ============================================================
// FARM VOCAB GAME - Phiên bản cao cấp
// (Thành tựu, Kim cương, Cấp độ, Mở rộng đất, Phân cấp vật phẩm)
// ============================================================

import { useState, useEffect, useRef } from "react";
import { db } from "./firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";

const DEFAULT_PLOT_COUNT = 3; // Bắt đầu với 3 ô
const MAX_PLOT_COUNT = 30;     // Tối đa 30 ô

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

// Cấu hình cây cổ thụ - THỜI GIAN HỒI QUẢ GIẢM XUỐNG (phút)
const ANCIENT_TREE_LEVELS = {
  0: { name: "🌱 Mầm non", maxFruits: 0, expRequired: 50, regenTimeMinutes: 0, harvestExp: 20 },
  1: { name: "🌿 Cây non", maxFruits: 5, expRequired: 100, regenTimeMinutes: 5, harvestExp: 30 },
  2: { name: "🌳 Cây trưởng thành", maxFruits: 3, expRequired: 180, regenTimeMinutes: 4, harvestExp: 40 },
  3: { name: "🌲 Đại thụ", maxFruits: 7, expRequired: 280, regenTimeMinutes: 4, harvestExp: 50 },
  4: { name: "🏝️ Cổ thụ", maxFruits: 10, expRequired: 400, regenTimeMinutes: 3, harvestExp: 60 },
  5: { name: "👑 Thần thụ", maxFruits: 15, expRequired: 550, regenTimeMinutes: 3, harvestExp: 75 },
  6: { name: "✨ Vạn niên thụ", maxFruits: 20, expRequired: 750, regenTimeMinutes: 3, harvestExp: 90 },
  7: { name: "🔥 Hỏa thụ", maxFruits: 23, expRequired: 1000, regenTimeMinutes: 3, harvestExp: 110 },
  8: { name: "💧 Thủy thụ", maxFruits: 25, expRequired: 1300, regenTimeMinutes: 3, harvestExp: 130 },
  9: { name: "⚡ Lôi thụ", maxFruits: 27, expRequired: 1700, regenTimeMinutes: 2, harvestExp: 150 },
  10: { name: "🐉 Long thụ", maxFruits: 30, expRequired: 2200, regenTimeMinutes: 1, harvestExp: 180 },
};

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

export default function FarmGame({ onBack, vocabData = [], updateGlobal, onSaveWord, onMoveWord, stats, currentUser, playSound }) {
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
  const [quizMode, setQuizMode] = useState(null); // 👈 THÊM DÒNG NÀY

  const [ancientSapling, setAncientSapling] = useState(null);

  
  // ===== STATE CHO MỞ RỘNG ĐẤT =====
  const [showExpandModal, setShowExpandModal] = useState(false);
  
  // ===== STATE CHO SỬ DỤNG VẬT PHẨM =====
  const [showItemMenu, setShowItemMenu] = useState(false);
  const [selectedPlotForItem, setSelectedPlotForItem] = useState(null);
  const [selectedItemId, setSelectedItemId] = useState(null);
  
  const [availableWords, setAvailableWords] = useState([]); // Ô vàng (chưa thuộc)
  const [masteredWords, setMasteredWords] = useState([]);   // Ô xanh (đã thuộc)

    // ===== CÂY CỔ THỤ =====
  const [ancientTrees, setAncientTrees] = useState([]);
  const [selectedTree, setSelectedTree] = useState(null);
  const [showTreeModal, setShowTreeModal] = useState(false);
  const [harvestQuizState, setHarvestQuizState] = useState(null); // { treeId, fruitId, correctCount, totalNeeded, questions, currentIndex }

  const [treeLearningState, setTreeLearningState] = useState(null);

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

  // Tính giá kim cương để mở rộng dựa trên số ô hiện tại
const getGemExpandCost = () => {
  const currentPlots = plotCount;
  // Giá tăng dần: 10, 15, 25, 40, 60, 85, 115, 150, 190
  const costMap = {
    3: 10,   // mở ô thứ 4
    4: 15,   // mở ô thứ 5
    5: 25,   // mở ô thứ 6
    6: 40,   // mở ô thứ 7
    7: 60,   // mở ô thứ 8
    8: 85,   // mở ô thứ 9
    9: 115,  // mở ô thứ 10
    10: 150, // mở ô thứ 11
    11: 190, // mở ô thứ 12
  };
  return costMap[currentPlots] || 999;
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

// Mở rộng đất bằng kim cương (giá tăng dần)
const expandWithGems = () => {
  if (plotCount >= MAX_PLOT_COUNT) {
    notify("🌍 Bạn đã đạt tối đa số ô đất!", "#ef4444");
    return;
  }
  
  const gemCost = getGemExpandCost();
  const nextPlots = plotCount + 1;
  
  if (gems < gemCost) {
    notify(`💎 Thiếu ${gemCost - gems} kim cương để mở rộng! (Cần ${gemCost}💎)`, "#ef4444");
    return;
  }
  
  setGems(prev => prev - gemCost);
  setPlotCount(nextPlots);
  
  const newPlots = [...plots];
  for (let i = plots.length; i < nextPlots; i++) {
    newPlots.push({
      id: i, crop: null, stage: 0, hasPest: false,
      linkedWord: null, wordData: null, timeLeft: 0,
    });
  }
  setPlots(newPlots);
  notify(`💎 Đã mở rộng đất lên ${nextPlots} ô! -${gemCost}💎`, "#eab308");
  setShowExpandModal(false);
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
            setAncientTrees(farmState.ancientTrees || []);

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
        // Ô vàng: savedWords (từ chưa thuộc)
        const savedWords = userData?.vocab?.savedWords || [];
        // Ô xanh: masteredWords (từ đã thuộc)
        const masteredWordsRaw = userData?.vocab?.masteredWords || [];
        // addedWordsObj chứa metadata đầy đủ cho từ ô vàng
        const addedWordsObj = userData?.vocab?.addedWordsObj || [];
        
        // Build ô vàng: ưu tiên metadata từ addedWordsObj, fallback là savedWords
        const yellowList = [];
        const seenYellow = new Set();
        addedWordsObj.forEach(item => {
          if (item.word && !seenYellow.has(item.word.toLowerCase())) {
            seenYellow.add(item.word.toLowerCase());
            yellowList.push(item);
          }
        });
        savedWords.forEach(word => {
          const wordStr = typeof word === 'string' ? word : word.word;
          if (wordStr && !seenYellow.has(wordStr.toLowerCase())) {
            seenYellow.add(wordStr.toLowerCase());
            yellowList.push(typeof word === 'object' ? word : { word: wordStr, meaning: "???" });
          }
        });
        setAvailableWords(yellowList);

        // Build ô xanh: masteredWords
        const greenList = [];
        const seenGreen = new Set();
        masteredWordsRaw.forEach(word => {
          const wordStr = typeof word === 'string' ? word : word.word;
          if (wordStr && !seenGreen.has(wordStr.toLowerCase())) {
            seenGreen.add(wordStr.toLowerCase());
            // Tìm metadata từ addedWordsObj nếu có
            const meta = addedWordsObj.find(w => w.word?.toLowerCase() === wordStr.toLowerCase());
            greenList.push(meta || (typeof word === 'object' ? word : { word: wordStr, meaning: "???" }));
          }
        });
        setMasteredWords(greenList);
        
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
          level, exp,ancientTrees,
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
      inventory, remainingKills, pestKilled, wordsMastered, achievements, level, exp, ancientTrees, currentUser, isLoading]);

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

useEffect(() => {
  const interval = setInterval(() => {
    setPlots(prev => prev.map(plot => {
      if (plot.stage === 0 || plot.stage === 3) return plot;
      if (plot.hasPest) return plot;
      
      // 👈 THÊM DÒNG NÀY ĐỂ DEBUG
      //console.log("Plot:", plot.id, "stage:", plot.stage, "timeLeft:", plot.timeLeft);
      
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

// ===== INTERVAL KIỂM TRA HỒI QUẢ CÂY CỔ THỤ =====
useEffect(() => {
  const fruitRegenInterval = setInterval(() => {
    setAncientTrees(prev => {
      if (!prev || prev.length === 0) return prev;
      const now = Date.now();
      let anyUpdated = false;
      const updated = prev.map(tree => {
        const needsUpdate = tree.fruits.some(f => !f.isReady && f.availableAt <= now);
        if (!needsUpdate) return tree;
        anyUpdated = true;
        return updateFruitRegen(tree);
      });
      return anyUpdated ? updated : prev;
    });
  }, 5000); // kiểm tra mỗi 5 giây
  return () => clearInterval(fruitRegenInterval);
}, [masteredWords]);

// ===== LẮNG NGHE TỪ VỪA ĐƯỢC HỌC THUỘC TỪ APP.JSX =====
useEffect(() => {
  const checkForMasteredWord = () => {
    const stored = localStorage.getItem("last_mastered_word");
    if (stored) {
      try {
        const { word, timestamp } = JSON.parse(stored);
        // Chỉ xử lý nếu timestamp trong vòng 5 giây
        if (Date.now() - timestamp < 5000) {
          onWordMastered(word);
        }
        localStorage.removeItem("last_mastered_word");
      } catch (e) {
        console.error("Lỗi parse last_mastered_word:", e);
      }
    }
  };
  
  // Kiểm tra ngay khi component mount
  checkForMasteredWord();
  
  // Lắng nghe sự kiện storage (khi tab khác thay đổi localStorage)
  window.addEventListener("storage", checkForMasteredWord);
  
  return () => {
    window.removeEventListener("storage", checkForMasteredWord);
  };
}, []);

useEffect(() => {
  if (activePanel !== "quiz" || answered || !question) {
    // Nếu là chế độ ancient_harvest và chưa answered, vẫn cho timer chạy
    if (quizMode === "ancient_harvest" && harvestQuizState && !answered) {
      // Timer sẽ được xử lý riêng
    } else {
      return;
    }
  }
  
  // Nếu là ancient_harvest và chưa answered, set timer
  if (quizMode === "ancient_harvest" && harvestQuizState && !answered) {
    setTimeLeft(15);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          // Tự động xử lý sai khi hết giờ
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
  }
  
  // Logic cũ cho quiz thường
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
}, [question, activePanel, answered, quizMode, harvestQuizState]);

// ===== THÊM CÁC HÀM NÀY NGAY SAU notify =====

// Lấy config theo level cây
const getTreeConfig = (level) => {
  return ANCIENT_TREE_LEVELS[Math.min(level, 10)] || ANCIENT_TREE_LEVELS[10];
};

// Tạo quả mới cho cây - quả được gán từ Ô XANH (masteredWords)
const createFruit = (treeLevel, masteredWordsList) => {
  const config = getTreeConfig(treeLevel);
  const now = Date.now();
  
  // Chọn một từ ngẫu nhiên từ danh sách masteredWords (ô xanh)
  let randomWord = null;
  if (masteredWordsList && masteredWordsList.length > 0) {
    const validWords = masteredWordsList.filter(w => w && w.word);
    if (validWords.length > 0) {
      randomWord = validWords[Math.floor(Math.random() * validWords.length)];
    }
  }
  
  // Fallback nếu ô xanh trống
  if (!randomWord) {
    randomWord = { word: "???", meaning: "Chưa có từ đã học", wordData: null };
  }
  
  return {
    id: `fruit_${now}_${Math.random()}`,
    word: randomWord.word,
    wordData: randomWord,
    availableAt: now,
    isReady: true,
  };
};

// Tạo mảng quả theo level cây - dùng Ô XANH (masteredWords)
const generateFruitsForLevel = (treeLevel, existingFruits = [], masteredWordPool = []) => {
  const config = getTreeConfig(treeLevel);
  const targetCount = config.maxFruits;
  const currentCount = existingFruits.length;
  
  if (currentCount >= targetCount) return existingFruits;
  
  const newFruits = [...existingFruits];
  for (let i = currentCount; i < targetCount; i++) {
    newFruits.push(createFruit(treeLevel, masteredWordPool));
  }
  return newFruits;
};

// Cập nhật thời gian hồi quả và gán từ mới từ Ô XANH (masteredWords) khi sẵn sàng
const updateFruitRegen = (tree) => {
  const now = Date.now();
  const config = getTreeConfig(tree.level);
  const regenTimeMs = config.regenTimeMinutes * 60 * 1000;
  
  let updated = false;
  const updatedFruits = tree.fruits.map(fruit => {
    if (!fruit.isReady && fruit.availableAt <= now) {
      updated = true;
      // Chọn từ mới từ Ô XANH (masteredWords), khác với từ hiện tại
      let newWordData = null;
      if (masteredWords && masteredWords.length > 0) {
        const validWords = masteredWords.filter(w => w && w.word && w.word !== fruit.word);
        const pool = validWords.length > 0 ? validWords : masteredWords.filter(w => w && w.word);
        if (pool.length > 0) {
          newWordData = pool[Math.floor(Math.random() * pool.length)];
        }
      }
      if (!newWordData) newWordData = { word: "???", meaning: "Chưa có từ đã học" };
      return {
        ...fruit,
        isReady: true,
        word: newWordData.word,
        wordData: newWordData,
      };
    }
    return fruit;
  });
  
  if (updated) {
    return { ...tree, fruits: updatedFruits };
  }
  return tree;
};  

// Thêm EXP cho cây
const addTreeExp = (tree, amount) => {
  let newExp = tree.exp + amount;
  let newLevel = tree.level;
  let leveledUp = false;
  
  while (newLevel < 10 && newExp >= ANCIENT_TREE_LEVELS[newLevel + 1].expRequired) {
    newExp -= ANCIENT_TREE_LEVELS[newLevel + 1].expRequired;
    newLevel++;
    leveledUp = true;
  }
  
  if (leveledUp) {
  const newConfig = getTreeConfig(newLevel);
  // 👈 SỬA: Dùng masteredWords (ô xanh) cho quả mới khi cây lên cấp
  const newFruits = generateFruitsForLevel(newLevel, tree.fruits, masteredWords);
  
  notify(`🌳✨ Cây "${tree.word}" đã lên cấp ${newLevel}! +${newConfig.maxFruits - tree.fruits.length} quả mới!`, "#8b5cf6");
  playSound("combo_max");
  
  return {
    ...tree,
    level: newLevel,
    exp: newExp,
    fruits: newFruits,
  };
}
  
  return { ...tree, exp: newExp, level: newLevel };
};

// Trồng cây mới - trồng vào ô đất trống (giống cây thường)
const plantAncientTree = async (wordObj) => {
  if (!wordObj || !wordObj.word) {
    notify("❌ Không thể trồng cây với từ này!", "#ef4444");
    return false;
  }
  
  // KIỂM TRA: Nếu đã có cây cổ thụ rồi thì không cho trồng thêm
  if (ancientTrees.length >= 1) {
    notify("🌳 Bạn đã có một cây cổ thụ rồi! Hãy chăm sóc cây hiện tại.", "#ef4444");
    return false;
  }
  
  // Kiểm tra nếu đang có mầm cây đang trồng
  if (ancientSapling) {
    notify("🌱 Bạn đang có một mầm cây cổ thụ đang phát triển! Hãy chăm sóc nó trước.", "#ef4444");
    return false;
  }
  
  // Tìm ô đất trống đầu tiên
  const emptyPlotIndex = plots.findIndex(p => p.stage === 0);
  if (emptyPlotIndex === -1) {
    notify("🌱 Không còn ô đất trống để trồng cây cổ thụ!", "#ef4444");
    return false;
  }
  
  if (seeds <= 0) {
    notify("🌱 Hết hạt giống! Hãy học từ để nhận thêm hạt.", "#ef4444");
    return false;
  }
  
  const crop = selectedCrop; // Dùng cây đang chọn
  const now = Date.now();
  
  // Trồng vào ô đất
  setPlots(prev => prev.map((p, idx) => {
    if (idx === emptyPlotIndex) {
      return {
        ...p,
        crop: crop.id,
        stage: 1,
        hasPest: false,
        linkedWord: wordObj.word,
        wordData: wordObj,
        timeLeft: crop.growTime,
        isAncientSapling: true, // Đánh dấu là mầm cây cổ thụ
      };
    }
    return p;
  }));
  
  // Lưu thông tin mầm cây
  setAncientSapling({
    plotId: emptyPlotIndex,
    word: wordObj.word,
    wordData: wordObj,
    plantedAt: now,
    growTime: crop.growTime,
  });
  
  setSeeds(prev => prev - 1);
  notify(`🌱 Đã trồng mầm cây cổ thụ từ từ "${wordObj.word}"! Hãy chăm sóc để cây lớn và thu hoạch.`, "#8b5cf6");
  
  return true;
};

// Bắt đầu hái quả (chỉ 1 câu quiz cho quả đó)
const startHarvestFruit = (tree, fruitId) => {
  const fruit = tree.fruits.find(f => f.id === fruitId);
  if (!fruit || !fruit.isReady) {
    notify(`🍎 Quả này chưa sẵn sàng để hái!`, "#ef4444");
    return;
  }
  
  if (!fruit.wordData || !fruit.wordData.word) {
       // Nếu không có dữ liệu, tạo lại từ dựa trên fruit.word
    const fallbackWordData = availableWords.find(w => w.word === fruit.word) || 
                             { word: fruit.word, meaning: "Đang cập nhật..." };
    fruit.wordData = fallbackWordData;
  }
  
  // Tạo 1 câu hỏi về chính từ của quả này
  const q = genQuestionForWord(fruit.wordData);
  if (!q) {
    notify(`❌ Không thể tạo câu hỏi cho từ "${fruit.word}"!`, "#ef4444");
    return;
  }
  
  setHarvestQuizState({
    treeId: tree.id,
    fruitId: fruit.id,
    targetWord: fruit.word,
    question: q,
  });
  setQuizMode("ancient_harvest");
  setActivePanel("quiz");
  setTimeLeft(15); // Reset timer
  setAnswered(false);
  setChosenOpt(null);
};

// Hoàn thành hái quả (1 quả)
const completeHarvestFruit = () => {
  if (!harvestQuizState) return;
  
  const tree = ancientTrees.find(t => t.id === harvestQuizState.treeId);
  if (!tree) return;
  
  const config = getTreeConfig(tree.level);
  
  setAncientTrees(prev => prev.map(t => {
    if (t.id === harvestQuizState.treeId) {
      const updatedFruits = t.fruits.map(fruit => {
        if (fruit.id === harvestQuizState.fruitId) {
          const regenTimeMs = config.regenTimeMinutes * 60 * 1000;
          // Chọn từ mới từ Ô XANH (masteredWords), khác với từ vừa hái
          let newWordData = null;
          if (masteredWords && masteredWords.length > 0) {
            const validWords = masteredWords.filter(w => w && w.word && w.word !== fruit.word);
            const pool = validWords.length > 0 ? validWords : masteredWords.filter(w => w && w.word);
            if (pool.length > 0) newWordData = pool[Math.floor(Math.random() * pool.length)];
          }
          if (!newWordData) newWordData = { word: "???", meaning: "Chưa có từ đã học" };
          return {
            ...fruit,
            isReady: false,
            availableAt: Date.now() + regenTimeMs,
            word: newWordData.word,
            wordData: newWordData,
          };
        }
        return fruit;
      });
      
      const treeWithExp = addTreeExp({ ...t, fruits: updatedFruits }, config.harvestExp);
      treeWithExp.harvestedCount = (t.harvestedCount || 0) + 1;
      
      return updateFruitRegen(treeWithExp);
    }
    return t;
  }));
  
  setCoins(prev => prev + 15);
  addExp(10);
  
  notify(`🍎 Hái quả "${harvestQuizState.targetWord}" thành công! +15🪙 +10EXP`, "#f59e0b");
  playSound("finish");
  confetti({ particleCount: 100, spread: 70, origin: { y: 0.5 }, zIndex: 9999 });
  
  // Không tự thoát — để người dùng bấm nút "Tiếp tục" (handled in UI)
};

// Xử lý quiz hái quả (1 câu duy nhất)
const handleAncientQuizAnswer = (selectedOpt) => {
  if (!harvestQuizState) return;
  
  // Dừng timer
  if (timerRef.current) {
    clearInterval(timerRef.current);
    timerRef.current = null;
  }
  
  const isCorrect = selectedOpt === harvestQuizState.question.answer;
  
  setAnswered(true);
  setChosenOpt(selectedOpt);
  
  if (isCorrect) {
    completeHarvestFruit();
  } else {
    notify(`❌ Sai rồi! Đáp án đúng là "${harvestQuizState.question.answer}". Mất lượt hái quả này!`, "#ef4444");
    playSound("wrong");
    // Người dùng tự bấm nút "Tiếp tục" để thoát
  }
};

// Xử lý thu hoạch mầm cây cổ thụ (sau khi làm đúng 1 câu quiz)
const handleAncientSaplingHarvest = (plotId, wordData, isCorrect) => {
  if (!isCorrect) {
    // Sai thì cây chết
    setPlots((prev) =>
      prev.map((p) =>
        p.id === plotId ? { 
          ...p, 
          stage: 0, 
          crop: null, 
          linkedWord: null, 
          wordData: null, 
          isAncientSapling: false,
          timeLeft: 0 
        } : p
      )
    );
    setAncientSapling(null);
    notify(`❌ Sai rồi! Mầm cây cổ thụ "${wordData.word}" đã chết. Hãy trồng lại từ đầu!`, "#ef4444");
    setQuizMode(null);
    setActivePanel("farm");
    return;
  }
  
  // Đúng -> cây lên cấp 1 và chuyển sang tab cây cổ thụ
  const config = getTreeConfig(1);
  // Dùng masteredWords (ô xanh) cho quả của cây cổ thụ
  const newFruits = generateFruitsForLevel(1, [], masteredWords);
  
  // Xóa mầm cây khỏi ô đất
  setPlots((prev) =>
    prev.map((p) =>
      p.id === plotId ? { 
        ...p, 
        stage: 0, 
        crop: null, 
        linkedWord: null, 
        wordData: null, 
        isAncientSapling: false,
        timeLeft: 0 
      } : p
    )
  );
  
  // Tạo cây cổ thụ mới
  const newTree = {
    id: `tree_${Date.now()}`,
    word: wordData.word,
    wordData: wordData,
    plantedAt: Date.now(),
    level: 1,
    exp: 0,
    fruits: newFruits,
    harvestedCount: 0,
    lastHarvestAt: null,
  };
  
  setAncientTrees([newTree]);
  setAncientSapling(null);
  
  // Chuyển từ từ Ô vàng sang Ô xanh
  if (onMoveWord && wordData) {
    onMoveWord("vocab", "savedWords", "masteredWords", wordData);
    setAvailableWords(prev => prev.filter(w => w.word !== wordData.word));
    setMasteredWords(prev => {
      if (prev.some(w => w.word === wordData.word)) return prev;
      return [...prev, wordData];
    });
  }
  
  // Thưởng
  setCoins(prev => prev + 50);
  addExp(20);
  
  notify(`🎉✨ THU HOẠCH THÀNH CÔNG! Cây cổ thụ "${wordData.word}" đã lên cấp 1 và ra ${config.maxFruits} quả! +50🪙 +20EXP`, "#8b5cf6");
  playSound("combo_max");
  confetti({ particleCount: 200, spread: 100, origin: { y: 0.5 }, zIndex: 9999 });
  
  setQuizMode(null);
  setAnswered(false);
  setChosenOpt(null);
  // Delay nhỏ để React commit ancientTrees state trước khi chuyển tab
  setTimeout(() => setActivePanel("ancient"), 80);
};

// Xử lý diệt sâu cho mầm cây cổ thụ
const handleAncientSaplingPest = (plotId, wordData, isCorrect) => {
  if (!isCorrect) {
    notify(`❌ Sai rồi! Sâu vẫn còn trên cây "${wordData.word}". Hãy thử lại!`, "#ef4444");
    setQuizMode(null);
    setActivePanel("farm");
    return;
  }
  
  // Đúng -> diệt sâu thành công
  setPlots((prev) =>
    prev.map((p) =>
      p.id === plotId ? { ...p, hasPest: false } : p
    )
  );
  setRemainingKills(prev => prev - 1);
  setPestKilled(prev => prev + 1);
  notify(`✅ Đã diệt sâu cho cây "${wordData.word}"! Còn ${remainingKills - 1} lượt diệt sâu.`, "#22c55e");
  checkAchievements({ pestKilled: pestKilled + 1 });
  
  setQuizMode(null);
  setActivePanel("farm");
};

// Xử lý quiz học từ để cây lên cấp
const handleTreeLearningAnswer = (selectedOpt) => {
  if (!treeLearningState) return;
  
  const currentQ = treeLearningState.questions[treeLearningState.currentIndex];
  let isCorrect = false;
  
  // Kiểm tra đáp án theo từng loại câu hỏi
  if (currentQ.type === "fill_blank") {
    isCorrect = selectedOpt === currentQ.answer;
  } else if (currentQ.type === "vn_to_en") {
    isCorrect = selectedOpt === currentQ.answer;
  } else {
    isCorrect = selectedOpt === currentQ.answer;
  }
  
  if (isCorrect) {
    const newCorrectCount = treeLearningState.correctCount + 1;
    
    if (newCorrectCount >= treeLearningState.totalNeeded) {
      // HOÀN THÀNH 10 CÂU -> CÂY LÊN CẤP
      completeTreeLevelUp();
    } else {
      // CHƯA ĐỦ -> CHUYỂN SANG CÂU TIẾP THEO
      setTreeLearningState(prev => ({
        ...prev,
        correctCount: newCorrectCount,
        currentIndex: prev.currentIndex + 1,
      }));
      notify(`📚 Tiến trình học từ "${treeLearningState.word}": ${newCorrectCount}/${prev.totalNeeded} câu đúng!`, "#22c55e");
    }
  } else {
    // SAI -> KHÔNG RESET, chỉ báo sai và vẫn tiếp tục
    setTreeLearningState(prev => ({
      ...prev,
      currentIndex: prev.currentIndex + 1,
    }));
    notify(`❌ Sai rồi! Đáp án đúng là "${currentQ.answer}". Hãy tiếp tục!`, "#ef4444");
    playSound("wrong");
  }
  
  setAnswered(true);
  setChosenOpt(selectedOpt);
};

// Hoàn thành học từ -> cây lên cấp 1
const completeTreeLevelUp = () => {
  if (!treeLearningState) return;
  
  const config = getTreeConfig(1);
  const newFruits = generateFruitsForLevel(1, [], masteredWords);
  
  // Cập nhật cây lên cấp 1
  setAncientTrees(prev => prev.map(tree => {
    if (tree.id === treeLearningState.treeId) {
      return {
        ...tree,
        level: 1,
        exp: 0,
        fruits: newFruits,
      };
    }
    return tree;
  }));
  
  // Chuyển từ từ Ô vàng sang Ô xanh
  if (onMoveWord && treeLearningState.wordData) {
    onMoveWord("vocab", "savedWords", "masteredWords", treeLearningState.wordData);
    setAvailableWords(prev => prev.filter(w => w.word !== treeLearningState.wordData.word));
    setMasteredWords(prev => {
      if (prev.some(w => w.word === treeLearningState.wordData.word)) return prev;
      return [...prev, treeLearningState.wordData];
    });
  }
  
  // Thưởng cho người chơi
  setCoins(prev => prev + 50);
  addExp(20);
  
  notify(`🎉✨ CHÚC MỪNG! Bạn đã học thuộc từ "${treeLearningState.word}"! Cây cổ thụ đã lên cấp 1 và ra ${config.maxFruits} quả! +50🪙 +20EXP`, "#8b5cf6");
  playSound("combo_max");
  confetti({ particleCount: 200, spread: 100, origin: { y: 0.5 }, zIndex: 9999 });
  
  // Reset state
  setTreeLearningState(null);
  setQuizMode(null);
  setAnswered(false);
  setChosenOpt(null);
  setTimeout(() => setActivePanel("ancient"), 80);
};

// Hàm gọi khi từ được học thuộc (chuyển từ ô vàng sang ô xanh)
const onWordMastered = (word) => {
  const tree = ancientTrees.find(t => t.word.toLowerCase() === word.toLowerCase());
  if (tree && tree.level === 0) {
    const config = getTreeConfig(1);
    // 👈 SỬA: Dùng masteredWords (ô xanh) cho quả của cây
    const newFruits = generateFruitsForLevel(1, [], masteredWords);
    
    setAncientTrees(prev => prev.map(t => {
      if (t.id === tree.id) {
        return {
          ...t,
          level: 1,
          exp: 0,
          fruits: newFruits,
        };
      }
      return t;
    }));
    
    notify(`🌿✨ Từ "${word}" đã thuộc! Cây cổ thụ của bạn đã lên cấp 1 và ra ${config.maxFruits} quả!`, "#22c55e");
    playSound("combo_3");
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.5 }, zIndex: 9999 });
  }
};

// Bắt đầu học quiz để cây lên cấp (Level 0 -> Level 1)
const startLearningForTree = (tree) => {
  if (!tree || !tree.wordData) {
    notify("❌ Không có dữ liệu từ để học!", "#ef4444");
    return;
  }
  
  const wordObj = tree.wordData;
  
  // Tạo 10 câu hỏi về cùng một từ này
  const questions = [];
  for (let i = 0; i < 10; i++) {
    // Tạo câu hỏi với các dạng khác nhau để đỡ nhàm chán
    let q;
    if (i % 3 === 0) {
      // Dạng 1: En -> Vn
      q = genQuestionForWord(wordObj);
    } else if (i % 3 === 1) {
      // Dạng 2: Vn -> En (cần tạo thủ công)
      const meaning = getMeaning(wordObj);
      const wrongPool = ["(n) sự vui vẻ", "(adj) nhanh chóng", "(v) phát triển"];
      q = {
        word: wordObj.word,
        answer: wordObj.word,
        meaning: meaning,
        options: shuffleArray([wordObj.word, ...wrongPool]),
        wordData: wordObj,
        type: "vn_to_en"
      };
    } else {
      // Dạng 3: Điền từ vào chỗ trống (nếu có usage)
      if (wordObj.usage && wordObj.usage.toLowerCase().includes(wordObj.word.toLowerCase())) {
        const sentence = wordObj.usage.replace(new RegExp(wordObj.word, 'gi'), '______');
        q = {
          word: wordObj.word,
          answer: wordObj.word,
          meaning: sentence,
          options: shuffleArray([wordObj.word, "complete", "finish", "achieve"]),
          wordData: wordObj,
          type: "fill_blank"
        };
      } else {
        q = genQuestionForWord(wordObj);
      }
    }
    
    if (q) questions.push(q);
    else questions.push(genQuestionForWord(wordObj));
  }
  
  if (questions.length < 10) {
    notify(`❌ Không đủ câu hỏi để tạo quiz!`, "#ef4444");
    return;
  }
  
  // Lưu state cho quiz học từ
  setTreeLearningState({
    treeId: tree.id,
    word: tree.word,
    wordData: wordObj,
    correctCount: 0,
    totalNeeded: 10,
    questions: questions,
    currentIndex: 0,
  });
  setQuizMode("tree_learning");
  setActivePanel("quiz");
};


  const plantOnPlot = (plotId) => {
    if (seeds <= 0) { notify("Hết hạt giống! Trả lời đúng để nhận thêm 🌱", "#ef4444"); return; }
    // Gieo mầm lấy từ Ô VÀNG (savedWords - chưa thuộc)
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
    notify(`🌱 Đã gieo "${randomWord.word}" (ô vàng) vào ruộng!`, "#22c55e");
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
  
  // Nếu đây là mầm cây cổ thụ (chỉ cần check plot flag, không cần ancientSapling state vì có thể bị mất khi reload)
  if (plot.isAncientSapling) {
    const q = genQuestionForWord(plot.wordData);
    if (!q) {
      notify("❌ Không thể tạo câu hỏi cho từ này!", "#ef4444");
      return;
    }
    setQuestion(q);
    setAnswered(false);
    setChosenOpt(null);
    setQuizTarget(plotId);
    setQuizMode("ancient_sapling_harvest"); // Chế độ thu hoạch mầm cây
    setActivePanel("quiz");
    return;
  }
  
  // Cây thường - giữ nguyên logic cũ
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
      // Thêm vào ô xanh trong state local
      setMasteredWords(prev => {
        if (prev.some(w => w.word === wordData.word)) return prev;
        return [...prev, wordData];
      });
    }
    
    setShowHarvest({ plotId, reward: total, bonus, exp: expReward });
    setTimeout(() => setShowHarvest(null), 1800);
    notify(`🎉 Thu hoạch thành công! +${total}🪙 +${expReward} EXP. Từ "${wordData.word}" đã chuyển vào Ô xanh!`, "#f59e0b");
    checkAchievements({ score: score + 1, wordsMastered: wordsMastered + 1, coins: coins + total });
  };

  const startQuiz = (targetPlotId = null) => {
    // Kết hợp từ ô vàng + ô xanh cho quiz học từ
    const combinedWords = [...availableWords, ...masteredWords];
    if (!combinedWords || combinedWords.length < 4) { 
      notify("Cần ít nhất 4 từ vựng (ô vàng + ô xanh) để chơi!", "#ef4444"); 
      return; 
    }
    const shuffled = shuffleArray(combinedWords);
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

      // Xử lý thu hoạch mầm cây cổ thụ
  if (quizMode === "ancient_sapling_harvest") {
    const isCorrect = opt === question?.answer;
    const targetPlotId = quizTarget;
    setAnswered(true);
    setChosenOpt(opt);
    setQuizTarget(null);
    if (targetPlotId !== null) {
      const targetPlot = plots.find(p => p.id === targetPlotId);
      if (targetPlot && targetPlot.wordData) {
        // Delay để React render kết quả đúng/sai trước khi chuyển tab
        setTimeout(() => {
          handleAncientSaplingHarvest(targetPlotId, targetPlot.wordData, isCorrect);
        }, isCorrect ? 900 : 1800);
      }
    }
    return;
  }
  
  // Xử lý diệt sâu cho mầm cây cổ thụ
  if (quizMode === "ancient_sapling_pest") {
    const isCorrect = opt === question?.answer;
    if (quizTarget !== null) {
      const targetPlot = plots.find(p => p.id === quizTarget);
      if (targetPlot && targetPlot.wordData) {
        handleAncientSaplingPest(quizTarget, targetPlot.wordData, isCorrect);
      }
    }
    setAnswered(true);
    setChosenOpt(opt);
    if (quizTarget !== null) setQuizTarget(null);
    return;
  }

      // ===== THÊM ĐIỀU KIỆN NÀY VÀO ĐẦU HÀM =====
    if (quizMode === "ancient_harvest") {
      handleAncientQuizAnswer(opt);
      return;
    }

    if (quizMode === "tree_learning" && treeLearningState) {
      handleTreeLearningAnswer(opt);
      return;
    }

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
  
  const plot = plots.find(p => p.id === plotId);
  
  // Nếu là mầm cây cổ thụ, quiz sẽ hỏi về chính từ đó
  if (plot?.isAncientSapling && plot.wordData) {
    const q = genQuestionForWord(plot.wordData);
    if (q) {
      setQuestion(q);
      setAnswered(false);
      setChosenOpt(null);
      setQuizTarget(plotId);
      setQuizMode("ancient_sapling_pest"); // Chế độ diệt sâu cho mầm cây
      setActivePanel("quiz");
      return;
    }
  }
  
  // Logic cũ cho cây thường
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
    // Reset plots
    const newPlots = Array.from({ length: DEFAULT_PLOT_COUNT }, (_, i) => ({
      id: i, crop: null, stage: 0, hasPest: false, linkedWord: null, wordData: null, timeLeft: 0,
    }));
    setPlots(newPlots);
    setPlotCount(DEFAULT_PLOT_COUNT);
    
    // Reset tài nguyên
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
    
    // Reset cấp độ người chơi
    setLevel(1);
    setExp(0);
    setNextLevelExp(LEVEL_CONFIG[1]?.expRequired || 9999);
    
    // ===== RESET CÂY CỔ THỤ =====
    setAncientTrees([]);           // Xóa tất cả cây cổ thụ
    setAncientSapling(null);       // Xóa mầm cây đang trồng
    setSelectedTree(null);         // Xóa cây đang chọn
    setShowTreeModal(false);       // Đóng modal nếu đang mở
    setHarvestQuizState(null);     // Xóa state quiz hái quả
    setTreeLearningState(null);    // Xóa state học từ
    setQuizMode(null);             // Xóa chế độ quiz
    
    // Reset các state khác nếu cần
    setQuestion(null);
    setAnswered(false);
    setChosenOpt(null);
    setQuizTarget(null);
    
    notify("🔄 Đã reset toàn bộ nông trại về mặc định!", "#ef4444");
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
      height: "calc(100vh / 0.75)", width: "calc(100vw / 0.75)", display: "flex", flexDirection: "column",
      fontFamily: "'Nunito', 'Segoe UI', system-ui, sans-serif",
      background: w.bg, transition: "background 1s", boxSizing: "border-box",
      overflow: "hidden", position: "fixed", top: 0, left: 0,
      zoom: "0.75",
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

        /* ===== CÂY CỔ THỤ EPIC STYLES ===== */
        @keyframes treeBreath { 0%,100%{transform:scaleY(1) scaleX(1)} 50%{transform:scaleY(1.012) scaleX(1.008)} }
        @keyframes leafSway { 0%,100%{transform:rotate(-2deg)} 50%{transform:rotate(2deg)} }
        @keyframes fruitBob { 0%,100%{transform:translate(-50%,-50%) scale(1)} 50%{transform:translate(-50%,-60%) scale(1.05)} }
        @keyframes fruitGlow { 0%,100%{box-shadow:0 0 8px 2px rgba(255,180,0,0.5)} 50%{box-shadow:0 0 18px 6px rgba(255,180,0,0.9)} }
        @keyframes fruitWaiting { 0%,100%{opacity:0.55;transform:translate(-50%,-50%) scale(0.9)} 50%{opacity:0.75;transform:translate(-50%,-50%) scale(0.95)} }
        @keyframes bgStars { 0%{opacity:0.3;transform:scale(1)} 50%{opacity:1;transform:scale(1.1)} 100%{opacity:0.3;transform:scale(1)} }
        @keyframes floatLeaf { 0%{transform:translateY(0) rotate(0deg);opacity:1} 100%{transform:translateY(-80px) rotate(360deg);opacity:0} }
        @keyframes shimmer { 0%{background-position:200% center} 100%{background-position:-200% center} }
        @keyframes levelUpPulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.04)} }
        @keyframes orbFloat { 0%,100%{transform:translateY(0px) rotate(0deg)} 50%{transform:translateY(-8px) rotate(5deg)} }
        @keyframes expGrow { from{width:0} }
        @keyframes glowPulse { 0%,100%{filter:brightness(1)} 50%{filter:brightness(1.25)} }
        @keyframes quizSlideIn { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }

        .ancient-panel-bg {
          background: linear-gradient(160deg, #0a1a0a 0%, #0d2d17 30%, #0a2020 60%, #100d1a 100%);
          min-height: 100%; position: relative; overflow: hidden;
        }
        .ancient-panel-bg::before {
          content:''; position:absolute; inset:0;
          background: radial-gradient(ellipse at 30% 20%, rgba(0,200,80,0.07) 0%, transparent 60%),
                      radial-gradient(ellipse at 70% 70%, rgba(100,50,200,0.07) 0%, transparent 60%);
          pointer-events:none;
        }

        .tree-world { position:relative; width:220px; height:240px; margin:0 auto; cursor:default; }
        .tree-trunk-epic {
          position:absolute; bottom:0; left:50%; transform:translateX(-50%);
          border-radius:8px 8px 4px 4px;
          background: linear-gradient(180deg, #5d3a1a 0%, #3b2008 50%, #2a1505 100%);
          box-shadow: inset -6px 0 12px rgba(0,0,0,0.5), inset 4px 0 8px rgba(255,200,100,0.08);
        }
        .tree-canopy-wrapper {
          position:absolute; left:50%; transform:translateX(-50%);
        }
        .tree-canopy-epic {
          border-radius:50% 48% 46% 46% / 55% 55% 45% 45%;
          overflow:hidden;
          animation: treeBreath 4s ease-in-out infinite;
          transform-origin: center bottom;
        }
        .tree-fruit-epic {
          position:absolute; border-radius:50%;
          display:flex; align-items:center; justify-content:center;
          font-size:16px; cursor:pointer; transition:transform 0.2s;
          user-select:none;
        }
        .tree-fruit-epic.ready {
          animation: fruitBob 2s ease-in-out infinite, fruitGlow 2s ease-in-out infinite;
          background: radial-gradient(circle at 35% 35%, #fff3, transparent 60%), #ff8c00;
          border: 2px solid #ffd700;
          width:32px; height:32px;
        }
        .tree-fruit-epic.ready:hover { transform:translate(-50%,-50%) scale(1.2) !important; }
        .tree-fruit-epic.waiting {
          animation: fruitWaiting 3s ease-in-out infinite;
          background: rgba(80,80,80,0.5);
          border: 1px solid rgba(255,255,255,0.15);
          width:22px; height:22px; font-size:11px;
        }
        
        .fruit-word-tooltip {
          position:absolute; bottom:110%; left:50%; transform:translateX(-50%);
          background:rgba(0,0,0,0.85); color:#ffd700; padding:3px 8px;
          border-radius:8px; font-size:10px; white-space:nowrap;
          pointer-events:none; opacity:0; transition:opacity 0.2s;
          border:1px solid rgba(255,215,0,0.3);
        }
        .tree-fruit-epic:hover .fruit-word-tooltip { opacity:1; }

        .tree-stat-card {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius:16px; padding:10px 14px;
          backdrop-filter: blur(8px);
          transition: all 0.2s;
        }
        .tree-stat-card:hover { background:rgba(255,255,255,0.08); border-color:rgba(255,215,0,0.3); }

        .harvest-btn-epic {
          background: linear-gradient(135deg, #ff8c00, #ffd700);
          border:none; border-radius:16px; color:#1a0a00;
          font-weight:900; cursor:pointer; font-family:inherit;
          transition:all 0.2s; position:relative; overflow:hidden;
          box-shadow: 0 4px 20px rgba(255,180,0,0.4);
        }
        .harvest-btn-epic::before {
          content:''; position:absolute; top:0; left:-100%;
          width:60%; height:100%; background:rgba(255,255,255,0.2);
          transform:skewX(-20deg); transition:left 0.4s;
        }
        .harvest-btn-epic:hover::before { left:140%; }
        .harvest-btn-epic:hover { transform:translateY(-2px); box-shadow:0 6px 28px rgba(255,180,0,0.6); }
        .harvest-btn-epic:disabled { background:#555; color:#999; cursor:not-allowed; box-shadow:none; transform:none; }

        .learn-btn-epic {
          background: linear-gradient(135deg, #4f46e5, #7c3aed);
          border:none; border-radius:16px; color:white;
          font-weight:900; cursor:pointer; font-family:inherit;
          transition:all 0.2s; box-shadow:0 4px 20px rgba(124,58,237,0.4);
        }
        .learn-btn-epic:hover { transform:translateY(-2px); box-shadow:0 6px 28px rgba(124,58,237,0.6); }

        .exp-bar-track { background:rgba(255,255,255,0.1); border-radius:10px; height:10px; overflow:hidden; }
        .exp-bar-fill {
          height:100%; border-radius:10px;
          background: linear-gradient(90deg, #ffd700, #ff8c00);
          box-shadow: 0 0 10px rgba(255,200,0,0.5);
          animation: expGrow 0.8s ease-out;
        }

        .fruit-list-item {
          display:flex; align-items:center; gap:10px;
          padding:8px 12px; border-radius:12px;
          transition:all 0.2s; cursor:pointer;
        }
        .fruit-list-item.ready {
          background: linear-gradient(135deg, rgba(255,140,0,0.15), rgba(255,215,0,0.1));
          border:1px solid rgba(255,200,0,0.3);
        }
        .fruit-list-item.ready:hover { background:rgba(255,180,0,0.25); transform:translateX(4px); }
        .fruit-list-item.waiting {
          background:rgba(255,255,255,0.03);
          border:1px solid rgba(255,255,255,0.06);
        }

        .quiz-ancient-overlay {
          position:fixed; inset:0; z-index:2000;
          background:linear-gradient(160deg, #0a1a0a, #0d2d17, #100d1a);
          display:flex; flex-direction:column; align-items:center; justify-content:center;
          padding:20px;
          animation: quizSlideIn 0.35s ease-out;
        }
        .quiz-option-ancient {
          width:100%; padding:14px 20px; border-radius:16px;
          border:2px solid rgba(255,215,0,0.2);
          background:rgba(255,255,255,0.05);
          color:#e2e8f0; font-weight:700; font-size:14px;
          cursor:pointer; text-align:left; font-family:inherit;
          transition:all 0.15s; display:flex; align-items:center; gap:12px;
          backdrop-filter:blur(8px);
        }
        .quiz-option-ancient:hover:not(:disabled) { background:rgba(255,215,0,0.1); border-color:rgba(255,215,0,0.5); transform:translateX(4px); }
        .quiz-option-ancient.correct { background:linear-gradient(135deg,#16a34a,#22c55e); border-color:#22c55e; color:white; transform:none; }
        .quiz-option-ancient.wrong { background:linear-gradient(135deg,#dc2626,#ef4444); border-color:#ef4444; color:white; transform:none; }
        .quiz-option-ancient:disabled { cursor:default; }

        .timer-ring { transition:stroke-dashoffset 1s linear; }

        .level-badge {
          display:inline-flex; align-items:center; gap:6px;
          padding:4px 14px; border-radius:20px;
          background:linear-gradient(135deg,rgba(255,215,0,0.15),rgba(255,140,0,0.1));
          border:1px solid rgba(255,215,0,0.4);
          font-size:13px; font-weight:800; color:#ffd700;
        }

        .ancient-empty-state {
          text-align:center; padding:40px 20px;
          background:rgba(255,255,255,0.03); border-radius:24px;
          border:1px dashed rgba(255,255,255,0.1);
        }

        .particle {
          position:absolute; border-radius:50%;
          animation: floatLeaf 2s ease-out forwards;
          pointer-events:none;
        }

        .quiz-word-card {
          background:linear-gradient(135deg,rgba(255,215,0,0.08),rgba(255,140,0,0.05));
          border:1px solid rgba(255,215,0,0.25); border-radius:20px;
          padding:20px; text-align:center; margin-bottom:16px;
          backdrop-filter:blur(8px);
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
          { id: "ancient", label: "🌳 Cây cổ thụ", color: "#8b5cf6" }, // 👈 THÊM DÒNG NÀY

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
            {/* Các ô đất hiện có */}
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
                    <div style={S.linkedWordTag}>
                      📖 {plot.linkedWord}
                      {plot.isAncientSapling && <span style={{ marginLeft: "4px", fontSize: "8px", color: "#8b5cf6" }}>👑</span>}
                    </div>
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
            
            {/* ===== Ô MỞ RỘNG (+) - CHỈ HIỂN THỊ KHI CHƯA ĐẠT TỐI ĐA ===== */}
            {plotCount < MAX_PLOT_COUNT && (
              <div
                onClick={() => setShowExpandModal(true)}
                style={{
                  background: "linear-gradient(135deg, #f0f0f0, #e0e0e0)",
                  border: "2px dashed #c0c0c0",
                  borderRadius: "20px",
                  padding: "12px 8px",
                  textAlign: "center",
                  minHeight: "130px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  transition: "transform 0.13s, background 0.2s",
                  opacity: 0.8,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = "scale(1.02)";
                  e.currentTarget.style.background = "linear-gradient(135deg, #e8e8e8, #d0d0d0)";
                  e.currentTarget.style.opacity = "1";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = "scale(1)";
                  e.currentTarget.style.background = "linear-gradient(135deg, #f0f0f0, #e0e0e0)";
                  e.currentTarget.style.opacity = "0.8";
                }}
              >
                <div style={{ fontSize: "36px", marginBottom: "8px" }}>➕</div>
                <div style={{ fontSize: "12px", fontWeight: "bold", color: "#666" }}>Mở rộng</div>
                <div style={{ fontSize: "10px", color: "#eab308", marginTop: "4px" }}>
                  💎 {getGemExpandCost()} kim cương
                </div>
                <div style={{ fontSize: "9px", color: "#999", marginTop: "2px" }}>
                  {plotCount}/{MAX_PLOT_COUNT}
                </div>
              </div>
            )}
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

        {activePanel === "quiz" && (
          <div style={{ maxWidth: "480px", margin: "0 auto", width: "100%" }}>
            {/* ===== QUIZ HỌC TỪ ĐỂ CÂY LÊN CẤP - EPIC DARK UI ===== */}
            {quizMode === "tree_learning" && treeLearningState && (() => {
              const currentQ = treeLearningState.questions[treeLearningState.currentIndex];
              const prevQ = treeLearningState.questions[treeLearningState.currentIndex - 1];
              const progress = (treeLearningState.correctCount / treeLearningState.totalNeeded) * 100;

              return (
                <div className="quiz-ancient-overlay">
                  {/* Header tiến trình */}
                  <div style={{
                    width:"100%", maxWidth:"460px", marginBottom:"16px",
                    display:"flex", flexDirection:"column", alignItems:"center", gap:"8px",
                  }}>
                    <div style={{
                      display:"flex", alignItems:"center", gap:"10px",
                      padding:"8px 20px", borderRadius:"20px",
                      background:"rgba(99,102,241,0.12)", border:"1px solid rgba(167,139,250,0.3)",
                    }}>
                      <span style={{fontSize:"20px"}}>📚</span>
                      <span style={{fontWeight:"900", color:"#a78bfa", fontSize:"14px"}}>
                        Học thuộc từ — <span style={{color:"#ffd700"}}>{treeLearningState.word}</span>
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div style={{width:"100%", maxWidth:"460px"}}>
                      <div style={{
                        display:"flex", justifyContent:"space-between",
                        fontSize:"11px", color:"rgba(167,139,250,0.7)", marginBottom:"5px",
                      }}>
                        <span>✅ Đúng: {treeLearningState.correctCount}/{treeLearningState.totalNeeded}</span>
                        <span>Câu {treeLearningState.currentIndex + 1}/{treeLearningState.questions.length}</span>
                      </div>
                      <div style={{height:"8px", background:"rgba(255,255,255,0.08)", borderRadius:"10px", overflow:"hidden"}}>
                        <div style={{
                          width:`${progress}%`, height:"100%", borderRadius:"10px",
                          background:"linear-gradient(90deg,#7c3aed,#a855f7)",
                          boxShadow:"0 0 10px rgba(168,85,247,0.5)",
                          transition:"width 0.4s ease",
                        }} />
                      </div>
                    </div>
                  </div>

                  {currentQ ? (
                    <>
                      {/* Word/Meaning card */}
                      <div className="quiz-word-card" style={{width:"100%", maxWidth:"460px"}}>
                        <div style={{fontSize:"11px", color:"rgba(167,139,250,0.6)", textTransform:"uppercase", letterSpacing:"2px", marginBottom:"8px"}}>
                          {currentQ.type === "fill_blank" ? "Điền từ vào chỗ trống" :
                           currentQ.type === "vn_to_en" ? "Chọn từ tiếng Anh đúng" :
                           "Nghĩa của từ này là gì?"}
                        </div>
                        <div style={{
                          fontSize: currentQ.type === "fill_blank" ? "16px" : "34px",
                          fontWeight:"900", color:"#fff",
                          letterSpacing:"-0.5px",
                          textShadow:"0 0 30px rgba(167,139,250,0.3)",
                          lineHeight:1.3,
                        }}>
                          {currentQ.type === "fill_blank" ? `"${currentQ.meaning}"` :
                           currentQ.type === "vn_to_en" ? currentQ.meaning :
                           currentQ.word}
                        </div>
                      </div>

                      {/* Options */}
                      <div style={{display:"flex", flexDirection:"column", gap:"10px", width:"100%", maxWidth:"460px"}}>
                        {currentQ.options.map((opt, i) => {
                          const isSelected = chosenOpt === opt;
                          const isCorrect = opt === currentQ.answer;
                          const cls = answered ? (isCorrect ? "correct" : isSelected ? "wrong" : "") : "";
                          const labels = ["A","B","C","D"];
                          return (
                            <button
                              key={i}
                              disabled={answered}
                              onClick={() => handleAnswer(opt)}
                              className={`quiz-option-ancient ${cls}`}
                              style={{borderColor: cls ? undefined : "rgba(167,139,250,0.2)"}}
                            >
                              <div style={{
                                width:"28px", height:"28px", borderRadius:"8px", flexShrink:0,
                                background: cls === "correct" ? "rgba(255,255,255,0.2)" : cls === "wrong" ? "rgba(255,255,255,0.2)" : "rgba(167,139,250,0.1)",
                                border:"1px solid rgba(167,139,250,0.3)",
                                display:"flex", alignItems:"center", justifyContent:"center",
                                fontSize:"13px", fontWeight:"900", color:"#a78bfa",
                              }}>{labels[i]}</div>
                              <span>{opt}</span>
                              {answered && isCorrect && <span style={{marginLeft:"auto"}}>✅</span>}
                              {answered && isSelected && !isCorrect && <span style={{marginLeft:"auto"}}>❌</span>}
                            </button>
                          );
                        })}
                      </div>

                      {/* Feedback */}
                      {answered && (
                        <div style={{
                          marginTop:"14px", width:"100%", maxWidth:"460px",
                          padding:"12px 18px", borderRadius:"16px",
                          background: chosenOpt === currentQ.answer ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
                          border:`1px solid ${chosenOpt === currentQ.answer ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                          display:"flex", alignItems:"center", justifyContent:"space-between", gap:"12px",
                        }}>
                          <div>
                            {chosenOpt === currentQ.answer ? (
                              <div style={{color:"#4ade80", fontWeight:"900"}}>✅ Chính xác!</div>
                            ) : (
                              <div>
                                <div style={{color:"#f87171", fontWeight:"900"}}>❌ Sai rồi!</div>
                                <div style={{color:"rgba(255,255,255,0.5)", fontSize:"11px", marginTop:"2px"}}>
                                  Đáp án: <strong style={{color:"#ffd700"}}>{currentQ.answer}</strong>
                                </div>
                              </div>
                            )}
                          </div>
                          {treeLearningState.correctCount < treeLearningState.totalNeeded && (
                            <button
                              className="learn-btn-epic"
                              style={{padding:"8px 18px", fontSize:"13px", flexShrink:0}}
                              onClick={() => { setAnswered(false); setChosenOpt(null); }}
                            >➡ Tiếp</button>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{color:"rgba(255,255,255,0.4)", fontSize:"14px"}}>Đang tải câu hỏi...</div>
                  )}

                  <button
                    onClick={() => {
                      setTreeLearningState(null);
                      setQuizMode(null);
                      setActivePanel("ancient");
                      setAnswered(false);
                      setChosenOpt(null);
                    }}
                    style={{
                      marginTop:"14px", background:"rgba(255,255,255,0.07)",
                      border:"1px solid rgba(255,255,255,0.12)", borderRadius:"12px",
                      color:"rgba(255,255,255,0.4)", padding:"8px 24px",
                      fontSize:"12px", cursor:"pointer", fontFamily:"inherit",
                    }}
                  >✕ Huỷ</button>
                </div>
              );
            })()}

            {/* ===== QUIZ HÁI QUẢ CÂY CỔ THỤ - EPIC DARK UI ===== */}
            {quizMode === "ancient_harvest" && harvestQuizState && (
              <div className="quiz-ancient-overlay">
                {/* Header */}
                <div style={{
                  width:"100%", maxWidth:"460px", marginBottom:"18px",
                  display:"flex", flexDirection:"column", alignItems:"center", gap:"10px",
                }}>
                  {/* Tiêu đề */}
                  <div style={{
                    display:"flex", alignItems:"center", gap:"10px",
                    padding:"8px 20px", borderRadius:"20px",
                    background:"rgba(255,140,0,0.12)", border:"1px solid rgba(255,215,0,0.3)",
                  }}>
                    <span style={{fontSize:"22px"}}>🍎</span>
                    <span style={{fontWeight:"900", color:"#ffd700", fontSize:"15px"}}>
                      Hái quả — <span style={{color:"#ff9800"}}>{harvestQuizState.targetWord}</span>
                    </span>
                  </div>

                  {/* Timer ring + countdown */}
                  <div style={{position:"relative", width:"72px", height:"72px"}}>
                    <svg width="72" height="72" style={{transform:"rotate(-90deg)"}}>
                      <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="5"/>
                      <circle
                        className="timer-ring"
                        cx="36" cy="36" r="30" fill="none"
                        stroke={timeLeft <= 5 ? "#ef4444" : "#ffd700"}
                        strokeWidth="5"
                        strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 30}`}
                        strokeDashoffset={`${2 * Math.PI * 30 * (1 - timeLeft / 15)}`}
                      />
                    </svg>
                    <div style={{
                      position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center",
                      fontSize:"20px", fontWeight:"900",
                      color: timeLeft <= 5 ? "#ef4444" : "#ffd700",
                    }}>{timeLeft}</div>
                  </div>
                </div>

                {/* Word card */}
                <div className="quiz-word-card" style={{width:"100%", maxWidth:"460px"}}>
                  <div style={{fontSize:"11px", color:"rgba(255,215,0,0.6)", textTransform:"uppercase", letterSpacing:"2px", marginBottom:"8px"}}>
                    Nghĩa của từ này là gì?
                  </div>
                  <div style={{
                    fontSize:"34px", fontWeight:"900", color:"#fff",
                    letterSpacing:"-1px", textShadow:"0 0 30px rgba(255,215,0,0.3)",
                  }}>
                    {harvestQuizState.question.word}
                  </div>
                </div>

                {/* Options */}
                <div style={{display:"flex", flexDirection:"column", gap:"10px", width:"100%", maxWidth:"460px"}}>
                  {harvestQuizState.question.options.map((opt, i) => {
                    const isSelected = chosenOpt === opt;
                    const isCorrect = opt === harvestQuizState.question.answer;
                    const cls = answered
                      ? isCorrect ? "correct" : isSelected ? "wrong" : ""
                      : "";
                    const labels = ["A","B","C","D"];
                    return (
                      <button
                        key={i}
                        disabled={answered}
                        onClick={() => handleAnswer(opt)}
                        className={`quiz-option-ancient ${cls}`}
                      >
                        <div style={{
                          width:"28px", height:"28px", borderRadius:"8px", flexShrink:0,
                          background: cls === "correct" ? "rgba(255,255,255,0.2)" : cls === "wrong" ? "rgba(255,255,255,0.2)" : "rgba(255,215,0,0.1)",
                          border: "1px solid rgba(255,215,0,0.2)",
                          display:"flex", alignItems:"center", justifyContent:"center",
                          fontSize:"13px", fontWeight:"900", color:"#ffd700",
                        }}>{labels[i]}</div>
                        <span>{opt}</span>
                        {answered && isCorrect && <span style={{marginLeft:"auto"}}>✅</span>}
                        {answered && isSelected && !isCorrect && <span style={{marginLeft:"auto"}}>❌</span>}
                      </button>
                    );
                  })}
                </div>

                {/* Result feedback */}
                {answered && (
                  <div style={{
                    marginTop:"16px", width:"100%", maxWidth:"460px",
                    padding:"14px 20px", borderRadius:"16px", textAlign:"center",
                    background: chosenOpt === harvestQuizState.question.answer
                      ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
                    border: `1px solid ${chosenOpt === harvestQuizState.question.answer ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                  }}>
                    {chosenOpt === harvestQuizState.question.answer ? (
                      <div style={{color:"#4ade80", fontWeight:"900", fontSize:"16px"}}>
                        🎉 Chính xác! +15🪙 +10 EXP
                      </div>
                    ) : (
                      <div>
                        <div style={{color:"#f87171", fontWeight:"900", fontSize:"15px"}}>❌ Sai rồi!</div>
                        <div style={{color:"rgba(255,255,255,0.6)", fontSize:"12px", marginTop:"4px"}}>
                          Đáp án: <strong style={{color:"#ffd700"}}>{harvestQuizState.question.answer}</strong>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Nút Tiếp tục (chỉ hiện sau khi đã trả lời) */}
                {answered && (
                  <button
                    className="harvest-btn-epic"
                    onClick={() => {
                      setHarvestQuizState(null);
                      setTreeLearningState(null);
                      setQuizMode(null);
                      setActivePanel("ancient");
                      setAnswered(false);
                      setChosenOpt(null);
                      setTimeLeft(15);
                    }}
                    style={{
                      marginTop:"14px", padding:"12px 40px",
                      fontSize:"15px", borderRadius:"16px",
                    }}
                  >
                    ✓ Tiếp tục
                  </button>
                )}

                {/* Cancel button (chỉ hiện khi chưa trả lời) */}
                {!answered && (
                  <button
                    onClick={() => {
                      setHarvestQuizState(null);
                      setQuizMode(null);
                      setActivePanel("ancient");
                      setAnswered(false);
                      setChosenOpt(null);
                    }}
                    style={{
                      marginTop:"14px", background:"rgba(255,255,255,0.07)",
                      border:"1px solid rgba(255,255,255,0.12)", borderRadius:"12px",
                      color:"rgba(255,255,255,0.45)", padding:"8px 24px",
                      fontSize:"12px", cursor:"pointer", fontFamily:"inherit",
                    }}
                  >
                    ✕ Huỷ và quay lại
                  </button>
                )}
              </div>
            )}

            {/* Quiz thông thường (cây trồng, boss, v.v) */}
            {quizMode !== "tree_learning" && question && (
              <>
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
              </>
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

        {activePanel === "ancient" && ancientTrees.length > 0 && (() => {
  const tree = ancientTrees[0];
  const config = getTreeConfig(tree.level);
  const levelEmojis = ["🌱","🌿","🌳","🌲","🏝️","👑","✨","🔥","💧","⚡","🐉"];
  const levelColors = ["#22c55e","#16a34a","#15803d","#166534","#14532d","#ffd700","#a855f7","#ef4444","#3b82f6","#eab308","#f97316"];
  const levelGlows  = ["rgba(34,197,94","rgba(34,197,94","rgba(22,163,74","rgba(22,163,74","rgba(20,83,45","rgba(255,215,0","rgba(168,85,247","rgba(239,68,68","rgba(59,130,246","rgba(234,179,8","rgba(249,115,22"];
  const treeEmoji = levelEmojis[Math.min(tree.level, 10)];
  const treeColor = levelColors[Math.min(tree.level, 10)];
  const treeGlow  = levelGlows[Math.min(tree.level, 10)];
  const canopySize = 110 + tree.level * 10;
  const trunkW = 24 + tree.level * 2;
  const trunkH = 55 + tree.level * 3;
  const readyFruits = tree.fruits.filter(f => f.isReady).length;
  const totalFruits = tree.fruits.length;

  const fruitPositions = [
    {top:"12%",left:"30%"},{top:"10%",left:"55%"},{top:"14%",left:"75%"},
    {top:"32%",left:"18%"},{top:"28%",left:"45%"},{top:"30%",left:"72%"},
    {top:"50%",left:"24%"},{top:"47%",left:"52%"},{top:"52%",left:"76%"},
    {top:"66%",left:"32%"},{top:"64%",left:"58%"},{top:"70%",left:"48%"},
  ];

  const expPct = tree.level < 10
    ? Math.min(100, (tree.exp / ANCIENT_TREE_LEVELS[tree.level + 1].expRequired) * 100)
    : 100;

  return (
    <div className="ancient-panel-bg" style={{ padding:"12px 12px", minHeight:"100%", display:"flex", flexDirection:"column", alignItems:"center", gap:"10px" }}>

      {/* ── HEADER CARD ── */}
      <div style={{
        width:"100%", maxWidth:"420px", borderRadius:"24px", padding:"12px 16px",
        background:"rgba(255,255,255,0.04)", border:`1px solid ${treeGlow},0.35)`,
        backdropFilter:"blur(12px)", display:"flex", alignItems:"center", gap:"14px",
        boxShadow:`0 0 30px ${treeGlow},0.15)`,
      }}>
        <div style={{
          width:"44px", height:"44px", borderRadius:"16px", flexShrink:0,
          background:`radial-gradient(circle at 35% 35%, rgba(255,255,255,0.2), transparent 70%), ${treeGlow},0.25)`,
          border:`2px solid ${treeGlow},0.5)`,
          display:"flex", alignItems:"center", justifyContent:"center", fontSize:"28px",
          boxShadow:`0 0 20px ${treeGlow},0.3)`,
          animation:"glowPulse 3s ease-in-out infinite",
        }}>{treeEmoji}</div>
        <div style={{flex:1, minWidth:0}}>
          <div style={{display:"flex", alignItems:"center", gap:"8px", marginBottom:"4px"}}>
            <div style={{fontSize:"18px", fontWeight:"900", color:"#f8fafc", letterSpacing:"-0.3px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>
              {tree.word}
            </div>
            <div className="level-badge">Lv.{tree.level}</div>
          </div>
          <div style={{fontSize:"12px", color:"rgba(255,255,255,0.55)", marginBottom:"6px"}}>{config.name}</div>
          {tree.level < 10 ? (
            <>
              <div style={{display:"flex", justifyContent:"space-between", fontSize:"10px", color:"rgba(255,215,0,0.7)", marginBottom:"4px"}}>
                <span>⚡ EXP tiến cấp {tree.level+1}</span>
                <span style={{fontWeight:"800"}}>{tree.exp} / {ANCIENT_TREE_LEVELS[tree.level+1].expRequired}</span>
              </div>
              <div className="exp-bar-track">
                <div className="exp-bar-fill" style={{width:`${expPct}%`}} />
              </div>
            </>
          ) : (
            <div style={{fontSize:"12px", color:"#ffd700", fontWeight:"800"}}>🐉 Đã đạt cấp tối đa!</div>
          )}
        </div>
      </div>

      {/* ── STATS ROW ── */}
      <div style={{display:"flex", gap:"8px", width:"100%", maxWidth:"420px"}}>
        {[
          {icon:"🍎", label:"Sẵn hái", val:`${readyFruits}/${totalFruits}`, color:"#ff9800"},
          {icon:"🏆", label:"Đã hái", val:tree.harvestedCount||0, color:"#ffd700"},
          {icon:"🌱", label:"Ngày trồng", val:new Date(tree.plantedAt).toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit'}), color:"#22c55e"},
          {icon:"⏱", label:"Hồi/quả", val:`${config.regenTimeMinutes}p`, color:"#60a5fa"},
        ].map(s => (
          <div key={s.label} className="tree-stat-card" style={{flex:1, textAlign:"center"}}>
            <div style={{fontSize:"18px"}}>{s.icon}</div>
            <div style={{fontSize:"14px", fontWeight:"900", color:s.color, lineHeight:1.1}}>{s.val}</div>
            <div style={{fontSize:"9px", color:"rgba(255,255,255,0.4)", marginTop:"2px"}}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── CÂY TRỰC QUAN ── */}
      <div style={{position:"relative"}}>
        <div className="tree-world">
          {/* Đất */}
          <div style={{
            position:"absolute", bottom:0, left:"50%", transform:"translateX(-50%)",
            width:`${trunkW + 60}px`, height:"14px", borderRadius:"50%",
            background:`radial-gradient(ellipse, ${treeGlow},0.25) 0%, transparent 70%)`,
          }} />
          {/* Thân cây */}
          <div className="tree-trunk-epic" style={{width:`${trunkW}px`, height:`${trunkH}px`}} />
          {/* Tán cây */}
          <div className="tree-canopy-wrapper" style={{
            bottom:`${trunkH - 16}px`,
          }}>
          <div className="tree-canopy-epic" style={{
            width:`${canopySize}px`, height:`${Math.round(canopySize*0.85)}px`,
            background:tree.level<=3
              ? `radial-gradient(ellipse at 40% 35%, rgba(255,255,255,0.15), transparent 55%), linear-gradient(180deg, #22c55e, #15803d)`
              : tree.level<=6
              ? `radial-gradient(ellipse at 40% 35%, rgba(255,255,255,0.15), transparent 55%), linear-gradient(180deg, #d97706, #92400e)`
              : tree.level<=8
              ? `radial-gradient(ellipse at 40% 35%, rgba(255,255,255,0.2), transparent 55%), linear-gradient(180deg, #60a5fa, #1d4ed8)`
              : `radial-gradient(ellipse at 40% 35%, rgba(255,255,255,0.25), transparent 55%), linear-gradient(180deg, #a855f7, #7c3aed)`,
            boxShadow:`0 0 40px ${treeGlow},0.3), inset 0 -10px 30px rgba(0,0,0,0.3)`,
          }}>
            {/* Quả trên tán */}
            {tree.fruits.map((fruit, idx) => {
              const pos = fruitPositions[idx % fruitPositions.length];
              return (
                <div
                  key={fruit.id}
                  className={`tree-fruit-epic ${fruit.isReady ? "ready" : "waiting"}`}
                  style={{ top:pos.top, left:pos.left, transform:"translate(-50%,-50%)" }}
                  onClick={e => {
                    e.stopPropagation();
                    if (fruit.isReady) startHarvestFruit(tree, fruit.id);
                    else {
                      const rem = Math.max(0, fruit.availableAt - Date.now());
                      const h = Math.floor(rem/(3600000)), m = Math.floor((rem%3600000)/60000);
                      notify(`⏳ "${fruit.word}" còn ${h>0?`${h}h `:""}${m}p nữa`, "#ff9800");
                    }
                  }}
                >
                  <div className="fruit-word-tooltip">{fruit.word}</div>
                  {fruit.isReady ? "🍎" : "🫧"}
                </div>
              );
            })}
          </div>
          </div>{/* end tree-canopy-wrapper */}
        </div>
        {/* Hào quang dưới cây */}
        <div style={{
          position:"absolute", bottom:-6, left:"50%", transform:"translateX(-50%)",
          width:`${canopySize*0.6}px`, height:"20px",
          background:`radial-gradient(ellipse, ${treeGlow},0.4) 0%, transparent 70%)`,
          pointerEvents:"none",
        }} />
      </div>

      {/* ── GỢI Ý TƯƠNG TÁC ── */}
      {readyFruits > 0 && (
        <div style={{
          display:"flex", alignItems:"center", gap:"8px",
          background:"rgba(255,140,0,0.12)", border:"1px solid rgba(255,215,0,0.25)",
          borderRadius:"14px", padding:"8px 14px",
          animation:"bounce 2s ease-in-out infinite",
        }}>
          <span style={{fontSize:"18px"}}>👆</span>
          <span style={{fontSize:"12px", color:"#ffd700", fontWeight:"700"}}>
            Nhấn vào quả 🍎 trên cây để hái! ({readyFruits} quả sẵn sàng)
          </span>
        </div>
      )}
      {readyFruits === 0 && totalFruits > 0 && (
        <div style={{
          display:"flex", alignItems:"center", gap:"8px",
          background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.1)",
          borderRadius:"14px", padding:"8px 14px",
        }}>
          <span style={{fontSize:"16px"}}>⏳</span>
          <span style={{fontSize:"12px", color:"rgba(255,255,255,0.45)", fontWeight:"600"}}>
            Quả đang chín… nhấn vào quả mờ để xem thời gian còn lại
          </span>
        </div>
      )}

      {/* ── ACTIONS ── */}
      {tree.level === 0 && (
        <div style={{width:"100%", maxWidth:"420px", display:"flex", gap:"10px"}}>
          <button
            className="learn-btn-epic"
            style={{flex:1, padding:"14px", fontSize:"15px"}}
            onClick={() => startLearningForTree(tree)}
          >
            📚 Học để lên cấp
          </button>
        </div>
      )}

      {/* ── CẤP TIẾP THEO ── */}
      {tree.level < 10 && (
        <div style={{
          width:"100%", maxWidth:"420px", borderRadius:"18px", padding:"14px 16px",
          background:"rgba(255,152,0,0.07)", border:"1px solid rgba(255,152,0,0.2)",
        }}>
          <div style={{fontSize:"12px", fontWeight:"800", color:"#ff9800", marginBottom:"8px"}}>
            ⭐ Lên cấp {tree.level+1} — {getTreeConfig(tree.level+1).name}
          </div>
          <div style={{display:"flex", gap:"16px", flexWrap:"wrap"}}>
            <div style={{fontSize:"12px", color:"rgba(255,255,255,0.55)"}}>
              🍎 +{getTreeConfig(tree.level+1).maxFruits - config.maxFruits} quả mới (tổng {getTreeConfig(tree.level+1).maxFruits})
            </div>
            <div style={{fontSize:"12px", color:"rgba(255,255,255,0.55)"}}>
              ⏱ Hồi {getTreeConfig(tree.level+1).regenTimeMinutes}p/quả
            </div>
            <div style={{fontSize:"12px", color:"rgba(255,255,255,0.55)"}}>
              ⚡ +{getTreeConfig(tree.level+1).harvestExp} EXP/hái
            </div>
          </div>
        </div>
      )}

      {/* ── XÓA CÂY ── */}
      <div style={{width:"100%", maxWidth:"420px", marginTop:"4px", paddingBottom:"16px"}}>
        <button
          onClick={() => {
            if (window.confirm(`🌳 Xóa cây "${tree.word}"?\n\nCây sẽ bị chặt, toàn bộ quả mất đi và bạn có thể trồng lại từ đầu.`)) {
              setAncientTrees([]);
              playSound("wrong");
            }
          }}
          style={{
            width:"100%", padding:"11px", borderRadius:"14px", border:"1px solid rgba(239,68,68,0.3)",
            background:"rgba(239,68,68,0.08)", color:"rgba(239,68,68,0.7)",
            fontSize:"13px", fontWeight:"700", cursor:"pointer",
            display:"flex", alignItems:"center", justifyContent:"center", gap:"6px",
            transition:"all 0.2s",
          }}
          onMouseEnter={e => { e.currentTarget.style.background="rgba(239,68,68,0.18)"; e.currentTarget.style.borderColor="rgba(239,68,68,0.6)"; e.currentTarget.style.color="#ef4444"; }}
          onMouseLeave={e => { e.currentTarget.style.background="rgba(239,68,68,0.08)"; e.currentTarget.style.borderColor="rgba(239,68,68,0.3)"; e.currentTarget.style.color="rgba(239,68,68,0.7)"; }}
        >
          🪓 Chặt cây & trồng lại
        </button>
      </div>
    </div>
  );
})()}

        {/* ── EMPTY STATE: Chưa có cây cổ thụ ── */}
        {activePanel === "ancient" && ancientTrees.length === 0 && (
          <div className="ancient-panel-bg" style={{minHeight:"100%", padding:"20px 14px", display:"flex", flexDirection:"column", alignItems:"center", gap:"16px"}}>

            {/* Header */}
            <div style={{textAlign:"center", paddingTop:"8px"}}>
              <div style={{fontSize:"64px", marginBottom:"8px", filter:"drop-shadow(0 0 24px rgba(34,197,94,0.5))", animation:"glowPulse 3s ease-in-out infinite"}}>🌱</div>
              <div style={{fontSize:"20px", fontWeight:"900", color:"#f8fafc"}}>Trồng Cây Cổ Thụ</div>
              <div style={{fontSize:"13px", color:"rgba(255,255,255,0.45)", marginTop:"4px", lineHeight:"1.6"}}>
                Chọn một từ trong Ô vàng bên dưới để trồng
              </div>
            </div>

            {/* Mầm đang lớn */}
            {ancientSapling && (
              <div style={{
                width:"100%", maxWidth:"420px", padding:"14px 16px", borderRadius:"18px",
                background:"rgba(34,197,94,0.1)", border:"1px solid rgba(34,197,94,0.3)",
                display:"flex", alignItems:"center", gap:"12px",
              }}>
                <div style={{fontSize:"28px", animation:"bounce 1.5s infinite"}}>🌿</div>
                <div>
                  <div style={{fontSize:"13px", fontWeight:"800", color:"#4ade80"}}>Mầm cây đang lớn trên nông trại!</div>
                  <div style={{fontSize:"12px", color:"rgba(255,255,255,0.5)", marginTop:"2px"}}>
                    Từ: <strong style={{color:"#ffd700"}}>{ancientSapling.word}</strong> — vào Tab Nông trại để thu hoạch
                  </div>
                </div>
                <button
                  onClick={() => setActivePanel("farm")}
                  className="harvest-btn-epic"
                  style={{padding:"8px 14px", fontSize:"12px", flexShrink:0}}
                >🌾 Đến ngay</button>
              </div>
            )}

            {/* Danh sách từ Ô vàng để trồng */}
            {!ancientSapling && (() => {
              const plantableWords = availableWords.filter(w => w && w.word && w.meaning && w.meaning !== "???");
              const allWords = availableWords.filter(w => w && w.word);
              const displayWords = plantableWords.length > 0 ? plantableWords : allWords;

              if (displayWords.length === 0) {
                return (
                  <div className="ancient-empty-state" style={{maxWidth:"380px", width:"100%"}}>
                    <div style={{fontSize:"40px", marginBottom:"12px"}}>📖</div>
                    <div style={{fontSize:"15px", fontWeight:"800", color:"#f8fafc", marginBottom:"8px"}}>Chưa có từ trong Ô vàng</div>
                    <div style={{fontSize:"13px", color:"rgba(255,255,255,0.4)", lineHeight:"1.6"}}>
                      Hãy học từ vựng và lưu từ khó vào Sổ tay (Ô vàng) trước nhé!
                    </div>
                  </div>
                );
              }

              return (
                <div style={{width:"100%", maxWidth:"420px"}}>
                  <div style={{
                    fontSize:"12px", fontWeight:"800", color:"rgba(255,215,0,0.6)",
                    textTransform:"uppercase", letterSpacing:"1px", marginBottom:"10px",
                    display:"flex", alignItems:"center", gap:"8px",
                  }}>
                    <div style={{flex:1, height:"1px", background:"rgba(255,255,255,0.08)"}} />
                    🌟 Chọn từ để trồng ({displayWords.length} từ trong Ô vàng)
                    <div style={{flex:1, height:"1px", background:"rgba(255,255,255,0.08)"}} />
                  </div>

                  {seeds <= 0 && (
                    <div style={{
                      padding:"10px 14px", borderRadius:"12px", marginBottom:"10px",
                      background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)",
                      fontSize:"12px", color:"#f87171", textAlign:"center",
                    }}>⚠️ Hết hạt giống! Trả lời quiz ở Tab Nông trại để nhận thêm 🌱</div>
                  )}

                  <div style={{display:"flex", flexDirection:"column", gap:"8px", maxHeight:"360px", overflowY:"auto"}}>
                    {displayWords.map((wordObj, idx) => (
                      <div
                        key={idx}
                        style={{
                          display:"flex", alignItems:"center", gap:"10px",
                          padding:"10px 14px", borderRadius:"14px",
                          background:"rgba(255,255,255,0.04)",
                          border:"1px solid rgba(255,215,0,0.15)",
                          transition:"all 0.2s", cursor: seeds > 0 ? "pointer" : "not-allowed",
                        }}
                        onMouseEnter={e => { if(seeds>0) e.currentTarget.style.background="rgba(255,215,0,0.08)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background="rgba(255,255,255,0.04)"; }}
                      >
                        <div style={{
                          width:"40px", height:"40px", borderRadius:"12px", flexShrink:0,
                          background:"linear-gradient(135deg,rgba(255,215,0,0.15),rgba(255,140,0,0.1))",
                          border:"1px solid rgba(255,215,0,0.3)",
                          display:"flex", alignItems:"center", justifyContent:"center",
                          fontSize:"18px",
                        }}>🌟</div>
                        <div style={{flex:1, minWidth:0}}>
                          <div style={{fontSize:"14px", fontWeight:"800", color:"#ffd700", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>
                            {wordObj.word}
                          </div>
                          <div style={{fontSize:"11px", color:"rgba(255,255,255,0.4)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>
                            {wordObj.meaning !== "???" ? wordObj.meaning : "Chưa có nghĩa"}
                          </div>
                        </div>
                        <button
                          disabled={seeds <= 0}
                          onClick={async () => {
                            if (seeds <= 0) { notify("🌱 Hết hạt giống!", "#ef4444"); return; }
                            const ok = await plantAncientTree(wordObj);
                            if (ok) setActivePanel("farm");
                          }}
                          className="harvest-btn-epic"
                          style={{padding:"8px 14px", fontSize:"12px", flexShrink:0}}
                        >🌱 Trồng</button>
                      </div>
                    ))}
                  </div>

                  <div style={{
                    marginTop:"10px", padding:"10px", borderRadius:"12px",
                    background:"rgba(255,255,255,0.03)", fontSize:"11px",
                    color:"rgba(255,255,255,0.3)", textAlign:"center",
                  }}>
                    💡 Sau khi trồng, vào <strong style={{color:"rgba(255,255,255,0.5)"}}>Tab Nông trại</strong> → đợi cây lớn → thu hoạch để tạo cây cổ thụ
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Modal mở rộng đất */}
{showExpandModal && (
  <div onClick={() => setShowExpandModal(false)} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
    <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: "20px", padding: "24px", width: "90%", maxWidth: "340px", textAlign: "center" }}>
      <div style={{ fontSize: "48px", marginBottom: "10px" }}>🌍</div>
      <h3 style={{ margin: "0 0 10px 0" }}>Mở rộng đất đai</h3>
      <p>Mở rộng từ <strong>{plotCount}</strong> lên <strong>{Math.min(plotCount + 1, MAX_PLOT_COUNT)}</strong> ô</p>
      
      {/* Lựa chọn mở bằng xu (nếu đủ cấp) */}
      {expandInfo && (
        <div style={{ background: "#e8f5e9", padding: "12px", borderRadius: "12px", margin: "10px 0" }}>
          <div>💰 Mở bằng xu: <strong style={{ color: "#f59e0b" }}>{expandInfo.cost}🪙</strong></div>
          {expandInfo.requiredLevel > level && (
            <div style={{ fontSize: "11px", color: "#f44336", marginTop: "4px" }}>
              ⚠️ Cần đạt cấp {expandInfo.requiredLevel} để mở bằng xu
            </div>
          )}
          <button 
            onClick={manualExpand} 
            disabled={expandInfo.requiredLevel > level || coins < expandInfo.cost}
            style={{
              width: "100%", marginTop: "8px", padding: "10px",
              background: (expandInfo.requiredLevel <= level && coins >= expandInfo.cost) ? "linear-gradient(135deg,#f59e0b,#fbbf24)" : "#ccc",
              color: "white", border: "none", borderRadius: "10px",
              fontWeight: "bold", cursor: (expandInfo.requiredLevel <= level && coins >= expandInfo.cost) ? "pointer" : "not-allowed"
            }}
          >
            Mở bằng {expandInfo.cost}🪙
          </button>
        </div>
      )}

      {/* Lựa chọn mở bằng kim cương */}
      {plotCount < MAX_PLOT_COUNT && (
        <div style={{ background: "#fff8e1", padding: "12px", borderRadius: "12px", margin: "10px 0" }}>
          <div>💎 Mở bằng kim cương: <strong style={{ color: "#eab308" }}>{getGemExpandCost()}💎</strong></div>
          <div style={{ fontSize: "11px", color: "#666", marginTop: "4px" }}>
            ✨ Giá sẽ tăng dần mỗi lần mở rộng!
          </div>
          <button 
            onClick={expandWithGems} 
            disabled={gems < getGemExpandCost()}
            style={{
              width: "100%", marginTop: "8px", padding: "10px",
              background: gems >= getGemExpandCost() ? "linear-gradient(135deg,#eab308,#f59e0b)" : "#ccc",
              color: "white", border: "none", borderRadius: "10px",
              fontWeight: "bold", cursor: gems >= getGemExpandCost() ? "pointer" : "not-allowed"
            }}
          >
            Mở bằng {getGemExpandCost()}💎
          </button>
        </div>
      )}
      
      <div style={{ display: "flex", gap: "12px", marginTop: "10px" }}>
        <button onClick={() => setShowExpandModal(false)} style={{ flex: 1, padding: "10px", background: "#e0e0e0", border: "none", borderRadius: "10px", cursor: "pointer" }}>Hủy</button>
      </div>
    </div>
  </div>
)}
      {/* ===== MODAL CHI TIẾT CÂY CỔ THỤ - EPIC ===== */}
      {showTreeModal && selectedTree && (
        <div onClick={() => setShowTreeModal(false)} style={{
          position:"fixed", inset:0, backgroundColor:"rgba(0,0,0,0.85)", zIndex:1200,
          display:"flex", alignItems:"center", justifyContent:"center", padding:"16px",
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background:"linear-gradient(160deg,#0a1a0a,#0d2d17,#100d1a)",
            borderRadius:"28px", padding:"24px", maxWidth:"400px", width:"100%",
            color:"white", border:`1px solid rgba(255,215,0,0.3)`,
            maxHeight:"88vh", overflowY:"auto",
            boxShadow:"0 0 60px rgba(255,215,0,0.1), 0 20px 60px rgba(0,0,0,0.5)",
            animation:"popIn 0.3s ease-out",
          }}>
            {/* Header */}
            <div style={{textAlign:"center", marginBottom:"20px"}}>
              <div style={{
                fontSize:"56px", marginBottom:"8px",
                filter:`drop-shadow(0 0 20px rgba(255,215,0,0.4))`,
                animation:"glowPulse 3s ease-in-out infinite",
              }}>
                {["🌱","🌿","🌳","🌲","🏝️","👑","✨","🔥","💧","⚡","🐉"][Math.min(selectedTree.level,10)]}
              </div>
              <div style={{fontSize:"22px", fontWeight:"900", color:"#ffd700", marginBottom:"4px"}}>
                {selectedTree.word}
              </div>
              <div className="level-badge">{getTreeConfig(selectedTree.level).name} • Lv.{selectedTree.level}</div>
            </div>

            {/* Stats grid */}
            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px", marginBottom:"16px"}}>
              {[
                {label:"Ngày trồng", val:new Date(selectedTree.plantedAt).toLocaleDateString('vi-VN'), icon:"📅"},
                {label:"Tổng quả đã hái", val:selectedTree.harvestedCount||0, icon:"🍎"},
                {label:"Quả sẵn hái", val:`${selectedTree.fruits.filter(f=>f.isReady).length}/${selectedTree.fruits.length}`, icon:"✅"},
                {label:"EXP hiện tại", val:selectedTree.exp, icon:"⚡"},
              ].map(s => (
                <div key={s.label} className="tree-stat-card" style={{textAlign:"center", padding:"10px"}}>
                  <div style={{fontSize:"20px"}}>{s.icon}</div>
                  <div style={{fontSize:"15px", fontWeight:"900", color:"#ffd700"}}>{s.val}</div>
                  <div style={{fontSize:"10px", color:"rgba(255,255,255,0.4)"}}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* EXP bar */}
            {selectedTree.level < 10 && (
              <div style={{marginBottom:"16px"}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:"11px",color:"rgba(255,215,0,0.7)",marginBottom:"4px"}}>
                  <span>Tiến độ lên cấp {selectedTree.level+1}</span>
                  <span>{selectedTree.exp}/{ANCIENT_TREE_LEVELS[selectedTree.level+1].expRequired}</span>
                </div>
                <div className="exp-bar-track">
                  <div className="exp-bar-fill" style={{width:`${Math.min(100,(selectedTree.exp/ANCIENT_TREE_LEVELS[selectedTree.level+1].expRequired)*100)}%`}} />
                </div>
              </div>
            )}

            {/* Danh sách quả chi tiết */}
            <div style={{
              borderTop:"1px solid rgba(255,255,255,0.08)", paddingTop:"14px", marginBottom:"16px",
            }}>
              <div style={{fontSize:"12px", fontWeight:"800", color:"rgba(255,255,255,0.4)", textTransform:"uppercase", letterSpacing:"1px", marginBottom:"10px"}}>
                🍎 Chi tiết từng quả
              </div>
              <div style={{display:"flex", flexDirection:"column", gap:"6px"}}>
                {selectedTree.fruits.map((fruit, idx) => {
                  const rem = !fruit.isReady ? Math.max(0,fruit.availableAt-Date.now()) : 0;
                  const m = Math.floor(rem/60000);
                  const s = Math.floor((rem%60000)/1000);
                  return (
                    <div key={fruit.id} className={`fruit-list-item ${fruit.isReady?"ready":"waiting"}`}>
                      <div style={{
                        width:"28px",height:"28px",borderRadius:"8px",flexShrink:0,
                        background:fruit.isReady?"linear-gradient(135deg,#ff8c00,#ffd700)":"rgba(255,255,255,0.06)",
                        display:"flex",alignItems:"center",justifyContent:"center",fontSize:"14px",
                      }}>{fruit.isReady?"🍎":"⏳"}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:"12px",fontWeight:"800",color:fruit.isReady?"#ffd700":"rgba(255,255,255,0.4)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {fruit.word}
                        </div>
                        <div style={{fontSize:"10px",color:fruit.isReady?"#ff9800":"rgba(255,255,255,0.2)"}}>
                          {fruit.isReady ? "Sẵn sàng" : `⏱ ${m}p ${s}s`}
                        </div>
                      </div>
                      {fruit.isReady && (
                        <button
                          className="harvest-btn-epic"
                          style={{padding:"5px 12px", fontSize:"11px"}}
                          onClick={() => { setShowTreeModal(false); startHarvestFruit(selectedTree, fruit.id); }}
                        >Hái!</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Next level info */}
            {selectedTree.level < 10 && (
              <div style={{
                padding:"12px 14px", borderRadius:"14px", marginBottom:"14px",
                background:"rgba(255,152,0,0.07)", border:"1px solid rgba(255,152,0,0.2)",
              }}>
                <div style={{fontSize:"12px",fontWeight:"800",color:"#ff9800",marginBottom:"6px"}}>
                  ⭐ Lên cấp {selectedTree.level+1}
                </div>
                <div style={{display:"flex",gap:"12px",flexWrap:"wrap"}}>
                  <span style={{fontSize:"11px",color:"rgba(255,255,255,0.5)"}}>
                    🍎 +{getTreeConfig(selectedTree.level+1).maxFruits-getTreeConfig(selectedTree.level).maxFruits} quả
                  </span>
                  <span style={{fontSize:"11px",color:"rgba(255,255,255,0.5)"}}>
                    ⏱ {getTreeConfig(selectedTree.level+1).regenTimeMinutes}p/quả
                  </span>
                </div>
              </div>
            )}

            <button
              onClick={() => setShowTreeModal(false)}
              style={{
                width:"100%",padding:"12px",borderRadius:"14px",
                background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.12)",
                color:"rgba(255,255,255,0.6)",fontWeight:"700",cursor:"pointer",fontFamily:"inherit",
                fontSize:"14px",
              }}
            >✕ Đóng</button>
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