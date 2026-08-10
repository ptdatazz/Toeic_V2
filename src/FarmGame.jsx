// ============================================================
// FARM VOCAB GAME - Phiên bản cao cấp
// (Thành tựu, Kim cương, Cấp độ, Mở rộng đất, Phân cấp vật phẩm)
// ============================================================

import { useState, useEffect, useRef, useMemo } from "react";
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

// ===== HỆ THỐNG MÙA =====
const SEASONS = {
  spring: { name: "Xuân",  emoji: "🌸", color: "#f9a8d4", bg: "linear-gradient(160deg,#fce7f3 0%,#fdf2f8 40%,#e0f2fe 100%)", tip: "Mùa xuân — vạn vật sinh sôi!", icon: "🌸" },
  summer: { name: "Hạ",   emoji: "☀️", color: "#fbbf24", bg: "linear-gradient(160deg,#fef3c7 0%,#fffbeb 40%,#ecfdf5 100%)", tip: "Mùa hạ — cây lớn nhanh hơn!", icon: "☀️" },
  autumn: { name: "Thu",  emoji: "🍂", color: "#f97316", bg: "linear-gradient(160deg,#ffedd5 0%,#fef3c7 40%,#fef9c3 100%)", tip: "Mùa thu — thu hoạch bội thu!", icon: "🍂" },
  winter: { name: "Đông", emoji: "❄️", color: "#93c5fd", bg: "linear-gradient(160deg,#eff6ff 0%,#e0f2fe 40%,#f0f9ff 100%)", tip: "Mùa đông — chỉ trồng được cây đặc biệt!", icon: "❄️" },
};

const SEASON_ORDER = ["spring", "summer", "autumn", "winter"];

// ===== LỊCH MÙA THEO THÁNG THỰC TẾ =====
// Mùa lệch ~6 tuần so với đầu tháng (giống thực tế):
//   Xuân : ngày 50–139  (≈ 19/2 → 18/5)
//   Hạ   : ngày 140–229 (≈ 19/5 → 17/8)
//   Thu  : ngày 230–319 (≈ 18/8 → 15/11)
//   Đông : ngày 320–360 và 1–49 (≈ 16/11 → 18/2)
const SEASON_BOUNDARIES = [
  { season: "spring", start: 50,  end: 139 },
  { season: "summer", start: 140, end: 229 },
  { season: "autumn", start: 230, end: 319 },
  { season: "winter", start: 320, end: 409 }, // 320–360 + 1–49 năm sau (end > 360 = xử lý đặc biệt)
];
const DAYS_PER_YEAR = 360;

// dayOfYear: 1–360. Trả về key mùa.
const getSeasonFromDayOfYear = (dayOfYear) => {
  const d = ((dayOfYear - 1 + DAYS_PER_YEAR) % DAYS_PER_YEAR) + 1; // chuẩn hoá về 1–360
  if (d >= 50  && d <= 139) return "spring";
  if (d >= 140 && d <= 229) return "summer";
  if (d >= 230 && d <= 319) return "autumn";
  return "winter"; // 320–360 và 1–49
};

// Chuyển (farmYear, farmMonth, farmDay) → dayOfYear (1–360)
const toDayOfYear = (month, day) => (month - 1) * 30 + day;

// Số ngày còn lại trong mùa hiện tại (tính từ dayOfYear)
const daysLeftInSeason = (dayOfYear) => {
  const d = ((dayOfYear - 1 + DAYS_PER_YEAR) % DAYS_PER_YEAR) + 1;
  if (d >= 50  && d <= 139) return 139 - d + 1;
  if (d >= 140 && d <= 229) return 229 - d + 1;
  if (d >= 230 && d <= 319) return 319 - d + 1;
  // Đông: d >= 320 → còn (360-d) + 49 ngày; d <= 49 → còn 49-d+1
  if (d >= 320) return (DAYS_PER_YEAR - d) + 49;
  return 49 - d + 1; // d <= 49
};

// ===== LỊCH NÔNG TRẠI =====
// 1 ngày  = 5 phút thực       = 300 giây
// 1 tháng = 30 ngày            = 150 phút = 9.000 giây (~2.5 tiếng thực)
// 1 mùa   = 3 tháng            = 90 ngày  = 27.000 giây (~7.5 tiếng thực)
// 1 năm   = 4 mùa              = 12 tháng = 360 ngày
const FARM_DAY_SEC          = 300;                                  // 5 phút / ngày
const FARM_DAYS_PER_MONTH   = 30;                                   // 30 ngày / tháng
const FARM_MONTHS_PER_SEASON = 3;                                   // 3 tháng / mùa
const FARM_DAYS_PER_SEASON  = FARM_DAYS_PER_MONTH * FARM_MONTHS_PER_SEASON; // 90 ngày / mùa
const SEASON_DURATION_SEC   = FARM_DAY_SEC * FARM_DAYS_PER_SEASON; // 27.000 giây / mùa
// Thời tiết đổi mỗi ngày (600s), để nhất quán với 1 ngày = 1 thời tiết
const WEATHER_DURATION_SEC  = FARM_DAY_SEC;

// ===== THỜI TIẾT =====
const WEATHER_TYPES = {
  sunny:   { emoji: "☀️",  label: "Nắng",    tip: "Cây mọc bình thường",     growMult: 1.0,  rewardMult: 1.0,  pestChance: 0.10 },
  cloudy:  { emoji: "⛅",  label: "Sáng tối", tip: "Cây mọc chậm hơn 20%",   growMult: 0.8,  rewardMult: 1.0,  pestChance: 0.12 },
  rainy:   { emoji: "🌧️", label: "Mưa",     tip: "Cây mọc nhanh 30%, +50% xu!", growMult: 1.3, rewardMult: 1.5, pestChance: 0.08 },
  stormy:  { emoji: "⛈️",  label: "Bão",     tip: "Cây dễ bị sâu, hái +20% xu!", growMult: 0.6, rewardMult: 1.2, pestChance: 0.35 },
};

// Thời tiết cho phép theo mùa
const SEASON_WEATHER = {
  spring: ["sunny", "rainy", "cloudy"],
  summer: ["sunny", "sunny", "cloudy", "stormy"],
  autumn: ["sunny", "rainy", "cloudy"],
  winter: ["cloudy", "rainy", "stormy"],
};

// Cây trồng theo mùa — mỗi cây chỉ trồng được trong mùa của mình
// seasons: mảng mùa cho phép trồng; nếu không có field seasons thì trồng quanh năm
// produce: { id, name, emoji, qty } — vật phẩm thu được khi thu hoạch cây đó
// maxSeeds: số mầm tối đa được trồng cùng lúc cho loài này
const CROP_TYPES = [
  { id: "wheat",      name: "Lúa mì",    emoji: "🌾", growTime: 30,  reward: 10, expReward: 5,  color: "#f59e0b", seasons: ["spring","summer","autumn"], maxSeeds: 4, produce: { id: "wheat_bundle",  name: "Bó lúa",    emoji: "🌾", qty: 2 } },
  { id: "carrot",     name: "Cà rốt",    emoji: "🥕", growTime: 45,  reward: 15, expReward: 8,  color: "#f97316", seasons: ["spring","autumn"],          maxSeeds: 3, produce: { id: "carrot_item",    name: "Củ cà rốt", emoji: "🥕", qty: 3 } },
  { id: "strawberry", name: "Dâu tây",   emoji: "🍓", growTime: 60,  reward: 25, expReward: 12, color: "#ec4899", seasons: ["spring","summer"],          maxSeeds: 3, produce: { id: "strawberry_item",name: "Quả dâu",   emoji: "🍓", qty: 4 } },
  { id: "corn",       name: "Ngô",       emoji: "🌽", growTime: 75,  reward: 30, expReward: 15, color: "#eab308", seasons: ["summer"],                   maxSeeds: 2, produce: { id: "corn_item",      name: "Bắp ngô",   emoji: "🌽", qty: 2 } },
  { id: "watermelon", name: "Dưa hấu",   emoji: "🍉", growTime: 120, reward: 50, expReward: 25, color: "#22c55e", seasons: ["summer"],                   maxSeeds: 1, produce: { id: "watermelon_item",name: "Dưa hấu",   emoji: "🍉", qty: 1 } },
  { id: "mushroom",   name: "Nấm tuyết", emoji: "🍄", growTime: 90,  reward: 40, expReward: 20, color: "#94a3b8", seasons: ["winter","autumn"],          maxSeeds: 2, produce: { id: "mushroom_item",  name: "Nấm tươi",  emoji: "🍄", qty: 3 } },
  { id: "pumpkin",    name: "Bí ngô",    emoji: "🎃", growTime: 100, reward: 45, expReward: 22, color: "#ea580c", seasons: ["autumn"],                   maxSeeds: 2, produce: { id: "pumpkin_item",   name: "Quả bí",    emoji: "🎃", qty: 2 } },
  { id: "cherry",     name: "Anh đào",   emoji: "🍒", growTime: 80,  reward: 35, expReward: 18, color: "#be123c", seasons: ["spring"],                   maxSeeds: 3, produce: { id: "cherry_item",    name: "Quả anh đào",emoji: "🍒", qty: 5 } },
];

// Bảng giá bán nông sản ở chợ (coins mỗi đơn vị — giá gốc)
const PRODUCE_SELL_PRICE = {
  wheat_bundle:   { coins: 8  },
  carrot_item:    { coins: 12 },
  strawberry_item:{ coins: 18 },
  corn_item:      { coins: 22 },
  watermelon_item:{ coins: 40 },
  mushroom_item:  { coins: 28 },
  pumpkin_item:   { coins: 32 },
  cherry_item:    { coins: 25 },
};

// ===== CÂY GEM ĐẶC BIỆT THEO NGÀY =====
// Mỗi ngày game (600s) sẽ có 1 loại cây bán được 💎 thay vì 🪙
// Dùng seed tất định: (năm * 1000 + ngày_trong_năm) để nhất quán giữa các lần reload
// dayOfYear = (seasonIdx * FARM_DAYS_PER_SEASON) + dayInSeason  →  1..360
// farmYear: năm nông trại; dayOfYear: 1–360 (= (month-1)*30 + day)
const getDailyGemCropId = (farmYear, dayOfYear) => {
  const seed = (farmYear * 1000 + dayOfYear) % 9999;
  const seasonKey = getSeasonFromDayOfYear(dayOfYear);
  const eligible = CROP_TYPES.filter(c => !c.seasons || c.seasons.includes(seasonKey));
  if (!eligible.length) return CROP_TYPES[0].id;
  return eligible[seed % eligible.length].id;
};

// Giá thực tế: cây gem hôm nay → bán được 💎, còn lại → 🪙
const getProduceSellPrice = (produceId, dailyGemCropId) => {
  const crop = CROP_TYPES.find(c => c.produce?.id === produceId);
  const baseCoins = PRODUCE_SELL_PRICE[produceId]?.coins || 10;
  if (crop && crop.id === dailyGemCropId) {
    // Giá kim cương: 1💎 mỗi 8 xu (tối thiểu 1💎)
    return { coins: 0, gems: Math.max(1, Math.floor(baseCoins / 8)) };
  }
  return { coins: baseCoins, gems: 0 };
};

// ===== HỆ THỐNG VẬT NUÔI =====
// Thức ăn: các nông sản thu được từ nông trại
// Mỗi con vật có từ riêng (từ Ô vàng), khi "trưởng thành" → thu hoạch quiz giống cây
const LIVESTOCK_TYPES = [
  {
    id: "chicken", name: "Gà", emoji: "🐔", adultEmoji: "🐓",
    food: ["wheat_bundle", "corn_item"],  // thức ăn hợp lệ
    foodName: "Bó lúa / Bắp ngô",
    foodEmoji: "🌾🌽",
    growTime: 120,       // giây để lớn
    feedsNeeded: 3,      // số lần cho ăn để lớn
    reward: 20,
    expReward: 10,
    color: "#f59e0b",
    maxCount: 3,
    desc: "Cho ăn lúa mì hoặc ngô để lớn",
  },
  {
    id: "rabbit", name: "Thỏ", emoji: "🐰", adultEmoji: "🐇",
    food: ["carrot_item"],
    foodName: "Củ cà rốt",
    foodEmoji: "🥕",
    growTime: 180,
    feedsNeeded: 4,
    reward: 30,
    expReward: 15,
    color: "#f9a8d4",
    maxCount: 2,
    desc: "Cho ăn cà rốt để lớn",
  },
  {
    id: "pig", name: "Heo", emoji: "🐷", adultEmoji: "🐖",
    food: ["corn_item", "pumpkin_item"],
    foodName: "Bắp ngô / Quả bí",
    foodEmoji: "🌽🎃",
    growTime: 240,
    feedsNeeded: 5,
    reward: 45,
    expReward: 20,
    color: "#f97316",
    maxCount: 2,
    desc: "Cho ăn ngô hoặc bí ngô để lớn",
  },
  {
    id: "cow", name: "Bò", emoji: "🐮", adultEmoji: "🐄",
    food: ["wheat_bundle", "mushroom_item"],
    foodName: "Bó lúa / Nấm tươi",
    foodEmoji: "🌾🍄",
    growTime: 360,
    feedsNeeded: 6,
    reward: 70,
    expReward: 30,
    color: "#78716c",
    maxCount: 1,
    desc: "Cho ăn lúa mì hoặc nấm để lớn",
  },
  {
    id: "fox", name: "Cáo", emoji: "🦊", adultEmoji: "🦊",
    food: ["strawberry_item", "cherry_item"],
    foodName: "Quả dâu / Quả anh đào",
    foodEmoji: "🍓🍒",
    growTime: 300,
    feedsNeeded: 5,
    reward: 55,
    expReward: 25,
    color: "#ea580c",
    maxCount: 1,
    desc: "Cho ăn dâu tây hoặc anh đào để lớn",
  },
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

// ===== BÙ THỜI GIAN OFFLINE =====
// Tính tiến toàn bộ trạng thái nông trại theo số giây đã trôi qua khi offline
function applyOfflineTime(farmState, offlineSecs) {
  if (!farmState || offlineSecs <= 0) return farmState;
  // Giới hạn tối đa 7 ngày thực để tránh bù quá nhiều
  const secs = Math.min(offlineSecs, 604800);

  // --- Bù cây trồng (plots) ---
  const CROP_GROW_TIMES = {
    wheat: 30, carrot: 45, strawberry: 60, corn: 75,
    watermelon: 120, mushroom: 90, pumpkin: 100, cherry: 80,
  };
  const updatedPlots = (farmState.plots || []).map(plot => {
    // Bỏ qua ô trống, đã trưởng thành, hoặc đang bị sâu
    if (plot.stage === 0 || plot.stage === 3 || plot.hasPest) return plot;
    const growTime = CROP_GROW_TIMES[plot.crop] || 30;
    let remaining = plot.timeLeft || 0;
    let stage = plot.stage;
    let elapsed = secs;
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

  // --- Bù lịch nông trại (mùa từ dayOfYear, ngày/tháng/năm) ---
  const _FARM_DAY_SEC = 300;

  let weatherTimer = farmState.weatherTimer ?? _FARM_DAY_SEC;
  let farmDay = farmState.farmDay ?? 1;
  let farmMonth = farmState.farmMonth ?? 1;
  let farmYear = farmState.farmYear ?? 1;
  let season = farmState.season ?? getSeasonFromDayOfYear(toDayOfYear(farmMonth, farmDay));

  // Bù từng "ngày nông trại" (300s) một để chính xác
  let remainSecs = secs;
  while (remainSecs > 0) {
    const tickDay = Math.min(remainSecs, weatherTimer);
    weatherTimer -= tickDay;
    remainSecs -= tickDay;

    if (weatherTimer <= 0) {
      weatherTimer = _FARM_DAY_SEC;
      farmDay++;
      if (farmDay > 30) {
        farmDay = 1;
        farmMonth++;
        if (farmMonth > 12) {
          farmMonth = 1;
          farmYear++;
        }
      }
      // Cập nhật mùa từ dayOfYear
      season = getSeasonFromDayOfYear(toDayOfYear(farmMonth, farmDay));
    }
  }

  // Đổi thời tiết ngẫu nhiên theo mùa mới (nếu mùa thay đổi)
  const SEASON_WEATHER_OFFLINE = {
    spring: ["sunny", "rainy", "cloudy"],
    summer: ["sunny", "sunny", "cloudy", "stormy"],
    autumn: ["sunny", "rainy", "cloudy"],
    winter: ["cloudy", "rainy", "stormy"],
  };
  const newWeather = season !== farmState.season
    ? (() => { const pool = SEASON_WEATHER_OFFLINE[season]; return pool[Math.floor(Math.random() * pool.length)]; })()
    : (farmState.weather ?? "sunny");

  return {
    ...farmState,
    plots: updatedPlots,
    weatherTimer,
    season,
    farmDay,
    farmMonth,
    farmYear,
    weather: newWeather,
  };
}

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
  const [season, setSeason] = useState(() => getSeasonFromDayOfYear(1));
  const [weatherTimer, setWeatherTimer] = useState(WEATHER_DURATION_SEC); // giây còn lại trong ngày

  // ===== LỊCH NÔNG TRẠI =====
  const [farmDay, setFarmDay]     = useState(1);   // ngày trong tháng: 1–30
  const [farmMonth, setFarmMonth] = useState(1);   // tháng trong năm: 1–12
  const [farmYear, setFarmYear]   = useState(1);   // năm nông trại
  // Giờ trong ngày: 0–23 (tua nhanh, 1 ngày thực = 24 giờ nông trại → cứ 300/24 ≈ 12.5s thực = +1 giờ)
  const [farmHour, setFarmHour] = useState(6);  // bắt đầu từ 6 giờ sáng
  const [farmMinute, setFarmMinute] = useState(0);
  const [dailyGemCrop, setDailyGemCrop] = useState(() =>
    getDailyGemCropId(1, toDayOfYear(1, 1)) // khởi tạo ban đầu: năm 1, tháng 1, ngày 1
  );
  const [inventory, setInventory] = useState({});
  const [produceInventory, setProduceInventory] = useState({}); // kho nông sản thu hoạch được
  const [isLoading, setIsLoading] = useState(true);
  const [remainingKills, setRemainingKills] = useState(0);
  const [lastStreakValue, setLastStreakValue] = useState(0);
  
  // ===== HỆ THỐNG CẤP ĐỘ =====
  const [level, setLevel] = useState(1);
  const [exp, setExp] = useState(0);
  const [nextLevelExp, setNextLevelExp] = useState(LEVEL_CONFIG[1]?.expRequired || 9999);

  // Refs để tránh stale closure trong updateLevel / addExp
  const expRef = useRef(0);
  const levelRef = useRef(1);
  const plotsRef = useRef([]);
  const plotCountRef = useRef(DEFAULT_PLOT_COUNT);
  
  // ===== THỐNG KÊ =====
  const [pestKilled, setPestKilled] = useState(0);
  const [wordsMastered, setWordsMastered] = useState(0);
  const [achievements, setAchievements] = useState([]);
  const [showAchievement, setShowAchievement] = useState(null);
  
  // ===== STATE UI =====
  const [selectedCrop, setSelectedCrop] = useState(CROP_TYPES[0]);
  const [activePanel, setActivePanel] = useState("farm");
  const [showCropPicker, setShowCropPicker] = useState(false);
  const [pendingPlotId, setPendingPlotId] = useState(null);
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

  // ===== VẬT NUÔI STATE =====
  // livestock: [{ id, type, word, wordData, feedCount, isAdult, linkedAt, quizTarget }]
  const [livestock, setLivestock] = useState([]);
  const [livestockQuizState, setLivestockQuizState] = useState(null); // { animalId, word, wordData, question }
  const [showLivestockFeedMenu, setShowLivestockFeedMenu] = useState(false);
  const [feedTargetAnimalId, setFeedTargetAnimalId] = useState(null);
  const [showSeedTradeModal, setShowSeedTradeModal] = useState(false);
  const [seasonTransition, setSeasonTransition] = useState(null); // { name, emoji, color }

  // ===== HÀM CẬP NHẬP CẤP ĐỘ =====
  // Sync refs luôn mới nhất
  expRef.current = exp;
  levelRef.current = level;
  plotsRef.current = plots;
  plotCountRef.current = plotCount;

  const updateLevel = (newExp, currentPlots, currentPlotCount) => {
    let curLevel = levelRef.current;
    let curExp = newExp;
    let didLevelUp = false;
    let finalPlotCount = currentPlotCount;
    let finalPlots = [...currentPlots];

    while (curLevel < LEVEL_CONFIG.length) {
      const nextConfig = LEVEL_CONFIG[curLevel];
      if (!nextConfig || curExp < nextConfig.expRequired) break;
      curExp -= nextConfig.expRequired;
      curLevel++;
      didLevelUp = true;
      notify(`🎉 CHÚC MỪNG! Lên cấp ${curLevel}! 🎉`, "#8b5cf6");

      // Mở rộng đất tự động theo plotUnlock của cấp vừa đạt
      const targetPlots = nextConfig.plotUnlock;
      if (targetPlots > finalPlotCount) {
        for (let i = finalPlots.length; i < targetPlots; i++) {
          finalPlots.push({ id: i, crop: null, stage: 0, hasPest: false, linkedWord: null, wordData: null, timeLeft: 0 });
        }
        finalPlotCount = targetPlots;
        notify(`🌍 Mở rộng đất lên ${targetPlots} ô!`, "#22c55e");
      }
    }

    // ĐÃ FIX: cập nhật ref NGAY (đồng bộ) thay vì chờ tới lần render sau,
    // để nếu addExp() được gọi liên tiếp gần nhau (vd thu hoạch nhanh 2 lần),
    // lệnh gọi sau vẫn đọc đúng exp/level mới nhất, không bị mất EXP đã cộng trước đó
    levelRef.current = curLevel;
    expRef.current = curExp;
    plotsRef.current = finalPlotCount > currentPlotCount ? finalPlots : plotsRef.current;
    plotCountRef.current = finalPlotCount;

    setLevel(curLevel);
    setExp(curExp);
    setNextLevelExp(LEVEL_CONFIG[curLevel]?.expRequired || 9999);
    // So sánh với currentPlotCount (tham số), không phải plotCount (stale closure)
    if (finalPlotCount > currentPlotCount) {
      setPlots(finalPlots);
      setPlotCount(finalPlotCount);
    }
    if (didLevelUp) checkAchievements({ level: curLevel });
  };

  // ===== HÀM NHẬN EXP =====
  const addExp = (amount) => {
    updateLevel(expRef.current + amount, plotsRef.current, plotCountRef.current);
  };

  // ===== KIỂM TRA THÀNH TỰU (cũ + mới vô hạn) =====
  const checkAchievements = (stateUpdate) => {
    const st = { score, coins, streak, plotCount, pestKilled, wordsMastered, level, ...stateUpdate };

    // 1. Thành tựu cũ (ACHIEVEMENTS cố định)
    ACHIEVEMENTS.forEach(ach => {
      if (!achievements.includes(ach.id) && ach.condition(st)) {
        setAchievements(prev => [...prev, ach.id]);
        setGems(prev => prev + ach.rewardGem);
        setShowAchievement(ach);
        setTimeout(() => setShowAchievement(null), 3000);
        notify(`🏆 Thành tựu: ${ach.name}! +${ach.rewardGem}💎`, "#8b5cf6");
      }
    });

    // 2. Nhiệm vụ vô hạn — kiểm tra các id động
    const checkInfinite = (milestones, statVal, prefix, gemBase, gemMult, nameFn, iconFn) => {
      milestones.forEach((m, i) => {
        const id = `${prefix}_${m}`;
        const gem = Math.round(gemBase * Math.pow(gemMult, i));
        if (statVal >= m && !achievements.includes(id)) {
          setAchievements(prev => [...prev, id]);
          setGems(prev => prev + gem);
          notify(`🏆 ${nameFn(m)}! +${gem}💎`, "#f59e0b");
        }
      });
    };

    checkInfinite([1,10,50,100,250,500,1000,2500,5000,10000], st.score, "harvest", 5, 1.8, m => `Thu hoạch ${m} cây`, m => "🌾");
    checkInfinite([5,10,20,30,50,75,100,150,200,300,500], st.streak, "streak", 8, 1.6, m => `Streak x${m}`, m => "⚡");
    checkInfinite([100,500,1000,5000,10000,50000,100000,500000], st.coins, "coins", 15, 2, m => `${m} xu`, m => "💰");
    checkInfinite([5,10,15,20,30,40,50,75,100], st.level, "level", 25, 1.7, m => `Cấp ${m}`, m => "⭐");
    checkInfinite([10,50,100,500,1000,5000,10000], st.pestKilled, "pest", 10, 1.9, m => `Diệt ${m} sâu`, m => "🐛");
    checkInfinite([20,50,100,250,500,1000,2500,5000], st.wordsMastered, "words", 20, 1.7, m => `${m} từ vựng`, m => "📖");
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

// ===== ĐỔI HẠT GIỐNG LẤY XU =====
const SEED_TRADE_OPTIONS = [
  { seeds: 1, coins: 5,  label: "1 hạt → 5🪙",   desc: "Tỉ lệ thấp nhất" },
  { seeds: 3, coins: 18, label: "3 hạt → 18🪙",  desc: "Tiết kiệm hơn" },
  { seeds: 5, coins: 35, label: "5 hạt → 35🪙",  desc: "Phổ biến nhất" },
  { seeds: 10, coins: 80, label: "10 hạt → 80🪙", desc: "Giá tốt nhất" },
];

const tradeSeedsForCoins = (option) => {
  if (seeds < option.seeds) {
    notify(`🌱 Không đủ hạt! Cần ${option.seeds} hạt (bạn có ${seeds})`, "#ef4444");
    return;
  }
  setSeeds(prev => prev - option.seeds);
  setCoins(prev => prev + option.coins);
  notify(`🌱→🪙 Đã đổi ${option.seeds} hạt lấy ${option.coins} xu!`, "#f59e0b");
  checkAchievements({ coins: coins + option.coins });
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
            // ===== BÙ THỜI GIAN OFFLINE =====
            const lastSaved = farmState.lastSaved || Date.now();
            const offlineSecs = Math.floor((Date.now() - lastSaved) / 1000);
            // Chỉ bù nếu offline hơn 5 giây
            const fs = offlineSecs > 5 ? applyOfflineTime(farmState, offlineSecs) : farmState;
            if (offlineSecs > 60) {
              const mins = Math.floor(offlineSecs / 60);
              console.log(`[🌾 Farm] Offline ${mins} phút → đã bù thời gian cho cây & lịch`);
            }
            // ====================================
            setPlots(fs.plots);
            setPlotCount(fs.plotCount ?? DEFAULT_PLOT_COUNT);
            setCoins(fs.coins ?? 50);
            setGems(fs.gems ?? 0);
            setSeeds(fs.seeds ?? 3);
            setScore(fs.score ?? 0);
            setStreak(fs.streak ?? 0);
            setWeather(fs.weather ?? "sunny");
            setSeason(fs.season ?? "spring");
            setWeatherTimer(fs.weatherTimer ?? WEATHER_DURATION_SEC);
            // Lịch nông trại
            const loadedDay   = fs.farmDay   ?? 1;
            const loadedMonth = fs.farmMonth ?? 1;
            const loadedYear  = fs.farmYear  ?? 1;
            const loadedDayOfYear = toDayOfYear(loadedMonth, loadedDay);
            setSeason(getSeasonFromDayOfYear(loadedDayOfYear));
            setFarmDay(loadedDay);
            setFarmMonth(loadedMonth);
            setFarmYear(loadedYear);
            setFarmHour(fs.farmHour ?? 6);
            setFarmMinute(fs.farmMinute ?? 0);
            setDailyGemCrop(getDailyGemCropId(loadedYear, loadedDayOfYear));
            setInventory(fs.inventory ?? {});
            setProduceInventory(fs.produceInventory ?? {});
            setRemainingKills(fs.remainingKills ?? 0);
            setLastStreakValue(fs.streak ?? 0);
            setPestKilled(fs.pestKilled ?? 0);
            setWordsMastered(fs.wordsMastered ?? 0);
            setAchievements(fs.achievements ?? []);
            setLevel(fs.level ?? 1);
            setExp(fs.exp ?? 0);
            // ĐÃ FIX: phải tính lại nextLevelExp theo đúng level vừa load,
            // nếu không nó sẽ giữ giá trị mặc định ban đầu (50, tương ứng cấp 1→2)
            // khiến thanh EXP hiển thị sai mẫu số sau khi tải lại trang (vd "170/50" dù đang ở cấp 3)
            setNextLevelExp(LEVEL_CONFIG[fs.level ?? 1]?.expRequired || 9999);
            setAncientTrees(fs.ancientTrees || []);
            setLivestock(fs.livestock || []);

          } else {
            const newPlots = Array.from({ length: DEFAULT_PLOT_COUNT }, (_, i) => ({
              id: i, crop: null, stage: 0, hasPest: false, 
              linkedWord: null, wordData: null, timeLeft: 0,
            }));
            setPlots(newPlots);
            setPlotCount(DEFAULT_PLOT_COUNT);
            // Lịch mới: ngày 1, tháng 1, năm 1, mùa đông (ngày 1 thuộc đông)
            setFarmDay(1); setFarmMonth(1); setFarmYear(1);
            setSeason(getSeasonFromDayOfYear(toDayOfYear(1, 1)));
            setDailyGemCrop(getDailyGemCropId(1, toDayOfYear(1, 1)));
          }
        }
        
        const userData = docSnap.data();
        // Ô vàng: savedWords (từ chưa thuộc)
        const savedWords = userData?.vocab?.savedWords || [];
        // Ô xanh: masteredWords (từ đã thuộc)
        const masteredWordsRaw = userData?.vocab?.masteredWords || [];
        // addedWordsObj chứa metadata đầy đủ cho tất cả từ
        const addedWordsObj = userData?.vocab?.addedWordsObj || [];

        // Build tập từ đã mastered để loại trừ khỏi ô vàng
        const masteredSet = new Set(
          masteredWordsRaw.map(w => (typeof w === 'string' ? w : w?.word || '')).filter(Boolean).map(s => s.toLowerCase())
        );

        // Build tập từ đang ở ô vàng (savedWords) để chỉ lấy đúng những từ đó
        const savedWordSet = new Set(
          savedWords.map(w => (typeof w === 'string' ? w : w?.word || '')).filter(Boolean).map(s => s.toLowerCase())
        );

        // Build ô vàng: CHỈ lấy từ có trong savedWords VÀ chưa ở masteredWords
        // Ưu tiên metadata đầy đủ từ addedWordsObj, fallback sang savedWords
        const yellowList = [];
        const seenYellow = new Set();

        // Duyệt savedWords làm nguồn chính (đây là danh sách ô vàng thực sự)
        savedWords.forEach(word => {
          const wordStr = typeof word === 'string' ? word : word?.word;
          if (!wordStr) return;
          const key = wordStr.toLowerCase();
          if (seenYellow.has(key)) return; // bỏ lặp
          if (masteredSet.has(key)) return; // đã mastered, không cho vào ô vàng
          seenYellow.add(key);
          // Tìm metadata đầy đủ từ addedWordsObj
          const meta = addedWordsObj.find(w => w?.word?.toLowerCase() === key);
          if (meta) {
            yellowList.push(meta);
          } else {
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
          plots, plotCount, coins, gems, seeds, score, streak, weather, season, weatherTimer,
          farmDay, farmMonth, farmYear, farmHour, farmMinute,
          inventory, produceInventory, remainingKills, pestKilled, wordsMastered, achievements,
          level, exp, ancientTrees, livestock,
          lastSaved: Date.now()
        };
        const userDocRef = doc(db, "users", currentUser.uid);
        await updateDoc(userDocRef, { farmState });
      } catch (error) {
        console.error("Lỗi lưu lên Firebase:", error);
      }
    }, 1000);
    
    return () => clearTimeout(saveTimeout);
  }, [plots, plotCount, coins, gems, seeds, score, streak, weather, season, weatherTimer,
      farmDay, farmMonth, farmYear, farmHour, farmMinute,
      inventory, produceInventory, remainingKills, pestKilled, wordsMastered, achievements, level, exp, ancientTrees, livestock, currentUser, isLoading]);

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

  // ===== LỊCH NÔNG TRẠI & THỜI TIẾT =====
  // weatherTimer đếm ngược 1 ngày (300s) → sang ngày mới, đổi thời tiết, tính cây gem
  // seasonTimer  đếm ngược 1 mùa (27.000s = 90 ngày × 300s) → đổi mùa
  // farmHour/farmMinute: đồng hồ 24h tua nhanh — 300 giây thực = 24 giờ nông trại
  //   → mỗi giây thực = 24/300 * 60 phút = 4.8 phút nông trại
  //   → mỗi giây thực = 4 phút + 48 giây nông trại ≈ tăng +4 phút 48s mỗi tick
  const FARM_MINS_PER_REAL_SEC = (24 * 60) / FARM_DAY_SEC; // 4.8 phút nông trại / giây thực
  useEffect(() => {
    let farmClockAccum = 0; // tích lũy phút lẻ
    const tick = setInterval(() => {

      // ── Cập nhật đồng hồ 24h nông trại ──
      farmClockAccum += FARM_MINS_PER_REAL_SEC;
      const addMins = Math.floor(farmClockAccum);
      farmClockAccum -= addMins;
      if (addMins > 0) {
        setFarmMinute(prevMin => {
          const totalMins = prevMin + addMins;
          const newMin = totalMins % 60;
          const addHrs = Math.floor(totalMins / 60);
          if (addHrs > 0) {
            setFarmHour(prevHr => (prevHr + addHrs) % 24);
          }
          return newMin;
        });
      }

      // ── Mỗi giây: đếm ngày (weatherTimer) ──
      setWeatherTimer(prev => {
        if (prev > 1) return prev - 1;

        // ── Hết 1 ngày → sang ngày mới ──
        setFarmYear(currentYear => {
          setFarmMonth(currentMonth => {
            setFarmDay(currentDay => {
              const nextDay = currentDay + 1;
              let realNextDay = nextDay;
              let nextMonth = currentMonth;
              let nextYear = currentYear;

              if (nextDay > 30) {
                realNextDay = 1;
                nextMonth = currentMonth + 1;
                if (nextMonth > 12) {
                  nextMonth = 1;
                  nextYear = currentYear + 1;
                }
              }

              const dayOfYear = toDayOfYear(nextMonth, realNextDay);
              const newSeason = getSeasonFromDayOfYear(dayOfYear);

              // Cập nhật mùa (so sánh với mùa hiện tại để phát hiện đổi mùa)
              setSeason(currentSeason => {
                if (newSeason !== currentSeason) {
                  // ── Chuyển mùa! ──
                  setSeasonTransition({ name: SEASONS[newSeason].name, emoji: SEASONS[newSeason].emoji, color: SEASONS[newSeason].color });
                  setTimeout(() => setSeasonTransition(null), 4000);

                  const gemCropId = getDailyGemCropId(nextYear, dayOfYear);
                  const gemCropObj = CROP_TYPES.find(c => c.id === gemCropId);
                  setDailyGemCrop(gemCropId);

                  // Đổi thời tiết theo mùa mới
                  const pool = SEASON_WEATHER[newSeason];
                  setWeather(pool[Math.floor(Math.random() * pool.length)]);

                  notify(
                    `🌿 Mùa ${SEASONS[newSeason].name} bắt đầu! ${SEASONS[newSeason].emoji}  ` +
                    `Năm ${nextYear} • ${gemCropObj?.emoji} ${gemCropObj?.name} bán được 💎 hôm nay!`,
                    SEASONS[newSeason].color
                  );
                } else {
                  // Ngày thường
                  const newGemCropId = getDailyGemCropId(nextYear, dayOfYear);
                  const gemCropName = CROP_TYPES.find(c => c.id === newGemCropId)?.name || "";
                  const gemCropEmoji = CROP_TYPES.find(c => c.id === newGemCropId)?.emoji || "🌾";
                  setDailyGemCrop(newGemCropId);

                  // Thay đổi thời tiết ngẫu nhiên theo mùa
                  const pool = SEASON_WEATHER[newSeason];
                  setWeather(pool[Math.floor(Math.random() * pool.length)]);

                  notify(
                    `📅 ${String(realNextDay).padStart(2,"0")}/${String(nextMonth).padStart(2,"0")}/${nextYear} — ${gemCropEmoji} ${gemCropName} bán được 💎 hôm nay!`,
                    "#8b5cf6"
                  );
                }

                // Reset đồng hồ về 00:00 mỗi ngày mới
                setFarmHour(0);
                setFarmMinute(0);

                return newSeason;
              });

              // Cập nhật tháng & năm trực tiếp tại đây (tránh dùng nextDay ở scope ngoài)
              setFarmMonth(() => nextMonth);
              if (nextYear !== currentYear) {
                setFarmYear(() => nextYear);
              }
              return realNextDay;
            });
            return currentMonth; // sẽ bị override bởi setFarmMonth bên trong
          });
          return currentYear; // sẽ bị override bởi setFarmYear bên trong nếu sang năm mới
        });

        return WEATHER_DURATION_SEC; // reset về 300s (1 ngày)
      });

    }, 1000);
    return () => clearInterval(tick);
  }, []);

  const notify = (text, color = "#22c55e") => {
    setNotification({ text, color });
    setTimeout(() => setNotification(null), 2200);
  };

// Ref để timer luôn đọc được giá trị mới nhất của weather
  const weatherRef = useRef("sunny");
  useEffect(() => { weatherRef.current = weather; }, [weather]);

useEffect(() => {
  const interval = setInterval(() => {
    const wMult = WEATHER_TYPES[weatherRef.current]?.growMult ?? 1.0;
    setPlots(prev => prev.map(plot => {
      if (plot.stage === 0 || plot.stage === 3) return plot;
      if (plot.hasPest) return plot;
      
      // Giảm timeLeft theo growMult: >1 giảm nhiều hơn, <1 ít hơn
      const decrease = wMult >= 1 ? Math.ceil(wMult) : (Math.random() < wMult ? 1 : 0);
      const newTimeLeft = Math.max(0, (plot.timeLeft || 0) - decrease);
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
    // Từ không có đủ dữ liệu quiz → hái luôn không cần trả lời
    const overrideSt = { treeId: tree.id, fruitId: fruit.id, targetWord: fruit.word, question: null };
    completeHarvestFruit(overrideSt);
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
const completeHarvestFruit = (overrideState) => {
  const quizSt = overrideState || harvestQuizState;
  if (!quizSt) return;
  
  const tree = ancientTrees.find(t => t.id === quizSt.treeId);
  if (!tree) return;
  
  const config = getTreeConfig(tree.level);
  
  setAncientTrees(prev => prev.map(t => {
    if (t.id === quizSt.treeId) {
      const updatedFruits = t.fruits.map(fruit => {
        if (fruit.id === quizSt.fruitId) {
          const regenTimeMs = config.regenTimeMinutes * 60 * 1000;
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
  
  notify(`🍎 Hái quả "${quizSt.targetWord}" thành công! +15🪙 +10EXP`, "#f59e0b");
  playSound("finish");
  try { confetti({ particleCount: 100, spread: 70, origin: { y: 0.5 }, zIndex: 9999 }); } catch(e) {}
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
  try { confetti({ particleCount: 200, spread: 100, origin: { y: 0.5 }, zIndex: 9999 }); } catch(e) {}
  
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
  try { confetti({ particleCount: 200, spread: 100, origin: { y: 0.5 }, zIndex: 9999 }); } catch(e) {}
  
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
    try { confetti({ particleCount: 100, spread: 70, origin: { y: 0.5 }, zIndex: 9999 }); } catch(e) {}
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


  // ===== HÀM VẬT NUÔI =====
  const addLivestock = (livestockTypeId) => {
    const ltype = LIVESTOCK_TYPES.find(l => l.id === livestockTypeId);
    if (!ltype) return;
    const currentCount = livestock.filter(a => a.type === livestockTypeId).length;
    if (currentCount >= ltype.maxCount) {
      notify(`🚫 ${ltype.emoji} Chỉ được nuôi tối đa ${ltype.maxCount} con ${ltype.name}!`, "#ef4444");
      return;
    }
    // Gán từ: ưu tiên Ô vàng, fallback sang Ô xanh
    const usedWords = new Set(livestock.map(a => a.word?.toLowerCase()).filter(Boolean));
    let wordObj = null;
    let wordSource = "yellow";

    if (availableWords.length > 0) {
      const pool = availableWords.filter(w => w && w.word && !usedWords.has(w.word.toLowerCase()));
      wordObj = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : availableWords[Math.floor(Math.random() * availableWords.length)];
      wordSource = "yellow";
    } else if (masteredWords.length > 0) {
      const pool = masteredWords.filter(w => w && w.word && !usedWords.has(w.word.toLowerCase()));
      wordObj = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : masteredWords[Math.floor(Math.random() * masteredWords.length)];
      wordSource = "green";
    } else {
      notify("📖 Không có từ nào để gán cho vật nuôi! Hãy thêm từ vào Sổ tay nhé.", "#ef4444");
      return;
    }

    const newAnimal = {
      id: `animal_${Date.now()}_${Math.random()}`,
      type: livestockTypeId,
      word: wordObj.word,
      wordData: wordObj,
      feedCount: 0,
      isAdult: false,
      addedAt: Date.now(),
      wordSource: wordSource,
    };
    setLivestock(prev => [...prev, newAnimal]);
    const srcLabel = wordSource === "yellow" ? "ô vàng" : "ô xanh (ôn lại)";
    notify(`🐣 Đã thêm ${ltype.emoji} ${ltype.name} và gán từ "${wordObj.word}" (${srcLabel})! Cho ăn ${ltype.feedsNeeded} lần để lớn.`, "#22c55e");
  };

  const feedAnimalAuto = (animalId) => {
    const animal = livestock.find(a => a.id === animalId);
    if (!animal) return;
    const ltype = LIVESTOCK_TYPES.find(l => l.id === animal.type);
    if (!ltype) return;
    if (animal.isAdult) {
      notify(`🐄 ${ltype.name} đã trưởng thành rồi! Hãy thu hoạch.`, "#f59e0b");
      return;
    }
    // Tự động chọn thức ăn đầu tiên còn trong kho
    const availFood = ltype.food.find(fid => (produceInventory[fid] || 0) > 0);
    if (!availFood) {
      const needed = ltype.food.map(fid => {
        const crop = CROP_TYPES.find(c => c.produce?.id === fid);
        return `${crop?.produce?.emoji || ""} ${crop?.produce?.name || fid}`;
      }).join(" hoặc ");
      notify(`📦 Hết thức ăn! ${ltype.emoji} ${ltype.name} cần: ${needed}`, "#ef4444");
      return;
    }
    feedAnimal(animalId, availFood);
  };

  const openFeedMenu = (animalId) => {
    setFeedTargetAnimalId(animalId);
    setShowLivestockFeedMenu(true);
  };

  const feedAnimal = (animalId, produceId) => {
    const animal = livestock.find(a => a.id === animalId);
    if (!animal) return;
    const ltype = LIVESTOCK_TYPES.find(l => l.id === animal.type);
    if (!ltype) return;
    if (!ltype.food.includes(produceId)) {
      const needed = ltype.food.map(fid => {
        const crop = CROP_TYPES.find(c => c.produce?.id === fid);
        return crop?.produce?.name || fid;
      }).join(", ");
      notify(`❌ ${ltype.emoji} ${ltype.name} không ăn loại này! Cần: ${needed}`, "#ef4444");
      return;
    }
    if ((produceInventory[produceId] || 0) <= 0) {
      const crop = CROP_TYPES.find(c => c.produce?.id === produceId);
      notify(`📦 Hết ${crop?.produce?.emoji || ""} ${crop?.produce?.name || "nông sản"} trong kho!`, "#ef4444");
      return;
    }
    if (animal.isAdult) {
      notify(`🐄 ${ltype.name} đã trưởng thành rồi! Hãy thu hoạch để mang lại phần thưởng.`, "#f59e0b");
      return;
    }
    // Trừ nông sản, tăng feedCount
    setProduceInventory(prev => ({ ...prev, [produceId]: Math.max(0, (prev[produceId] || 0) - 1) }));
    const newFeedCount = animal.feedCount + 1;
    const isNowAdult = newFeedCount >= ltype.feedsNeeded;
    setLivestock(prev => prev.map(a =>
      a.id === animalId ? { ...a, feedCount: newFeedCount, isAdult: isNowAdult } : a
    ));
    const crop = CROP_TYPES.find(c => c.produce?.id === produceId);
    if (isNowAdult) {
      notify(`🎉 ${ltype.emoji} ${ltype.name} đã TRƯỞNG THÀNH! Thu hoạch để nhận thưởng!`, "#f59e0b");
    } else {
      notify(`🍽️ Đã cho ${ltype.emoji} ăn ${crop?.produce?.emoji || ""} (${newFeedCount}/${ltype.feedsNeeded})`, "#22c55e");
    }
    setShowLivestockFeedMenu(false);
    setFeedTargetAnimalId(null);
  };

  const harvestAnimal = (animalId) => {
    const animal = livestock.find(a => a.id === animalId);
    if (!animal || !animal.isAdult) return;
    if (!animal.wordData) { notify("❌ Không có dữ liệu từ cho vật nuôi này!", "#ef4444"); return; }
    // Tạo quiz giống thu hoạch cây
    const q = genQuestionForWord(animal.wordData);
    if (!q) { notify("❌ Không thể tạo câu hỏi!", "#ef4444"); return; }
    setLivestockQuizState({ animalId, word: animal.word, wordData: animal.wordData, question: q });
    setQuizMode("livestock_harvest");
    setActivePanel("quiz");
    setTimeLeft(15);
    setAnswered(false);
    setChosenOpt(null);
  };

  const completeLivestockHarvest = (animalSnapshot, isCorrect) => {
    // Nhận trực tiếp snapshot của animal để tránh stale closure
    if (!animalSnapshot) return;
    const ltype = LIVESTOCK_TYPES.find(l => l.id === animalSnapshot.type);
    if (!ltype) return;
    if (isCorrect) {
      setCoins(prev => prev + ltype.reward);
      addExp(ltype.expReward);
      setScore(sc => sc + 1);
      setWordsMastered(wm => wm + 1);
      // Chỉ chuyển sang Ô xanh nếu từ từ Ô vàng
      const isFromGreen = animalSnapshot.wordSource === "green";
      if (!isFromGreen && onMoveWord && animalSnapshot.wordData) {
        onMoveWord("vocab", "savedWords", "masteredWords", animalSnapshot.wordData);
        setAvailableWords(prev => prev.filter(w => w.word !== animalSnapshot.word));
        setMasteredWords(prev => prev.some(w => w.word === animalSnapshot.word) ? prev : [...prev, animalSnapshot.wordData]);
      }
      // === RỚT SẢN PHẨM VÀO KHO (nếu có) ===
      if (ltype.produce) {
        const { id: pid, qty } = ltype.produce;
        setProduceInventory(prev => ({ ...prev, [pid]: (prev[pid] || 0) + qty }));
      }
      // Xóa vật nuôi khỏi danh sách
      setLivestock(prev => prev.filter(a => a.id !== animalSnapshot.id));
      const produceNote = ltype.produce ? ` +${ltype.produce.qty}${ltype.produce.emoji}` : "";
      const moveNote = isFromGreen ? "(ôn lại từ ô xanh)" : `Từ "${animalSnapshot.word}" → Ô xanh!`;
      notify(`🎉 Thu hoạch ${ltype.emoji} thành công! ${moveNote}${produceNote} +${ltype.reward}🪙 +${ltype.expReward}EXP`, "#f59e0b");
      try { confetti({ particleCount: 120, spread: 80, origin: { y: 0.5 }, zIndex: 9999 }); } catch(e) {}
      playSound("finish");
    } else {
      // Sai thì vật nuôi biến mất, không nhận thưởng
      setLivestock(prev => prev.filter(a => a.id !== animalSnapshot.id));
      notify(`❌ Sai rồi! ${ltype.emoji} ${ltype.name} "${animalSnapshot.word}" đã bỏ trốn. Không có phần thưởng!`, "#ef4444");
      playSound("wrong");
    }
    // Không reset UI/tab ở đây — để nút "Tiếp tục" trong quiz UI xử lý
  };

  const plantOnPlot = (plotId, cropOverride) => {
    const crop = cropOverride || selectedCrop;
    if (seeds <= 0) { notify("Hết hạt giống! Trả lời đúng để nhận thêm 🌱", "#ef4444"); return; }
    // Kiểm tra cây có trồng được trong mùa này không
    if (crop.seasons && !crop.seasons.includes(season)) {
      notify(`❌ ${crop.emoji} ${crop.name} không trồng được vào mùa ${SEASONS[season].name}!`, "#ef4444");
      return;
    }
    // maxSeeds động: tối thiểu là maxSeeds gốc, tối đa scale theo plotCount
    const seasonCrops = CROP_TYPES.filter(c => !c.seasons || c.seasons.includes(season));
    const baseTotal = seasonCrops.reduce((s, c) => s + (c.maxSeeds || 4), 0);
    const scaleFactor = baseTotal > 0 ? plotCount / baseTotal : 1;
    const dynamicMax = Math.max(crop.maxSeeds || 1, Math.ceil((crop.maxSeeds || 1) * scaleFactor));
    const currentSeedCount = plots.filter(p => p.stage >= 1 && p.crop === crop.id).length;
    if (currentSeedCount >= dynamicMax) {
      notify(`🚫 ${crop.emoji} ${crop.name} đã đủ ${dynamicMax} mầm cho ${plotCount} ô đất!`, "#ef4444");
      return;
    }
    // Gieo mầm: ưu tiên Ô VÀNG, nếu hết thì lấy Ô XANH (chỉ ôn lại, không move sang xanh khi thu hoạch)
    const usedWords = new Set(plots.filter(p => p.stage > 0 && p.linkedWord).map(p => p.linkedWord.toLowerCase()));
    let randomWord = null;
    let wordSource = "yellow";

    if (availableWords.length > 0) {
      const unusedYellow = availableWords.filter(w => w && w.word && !usedWords.has(w.word.toLowerCase()));
      const yellowPool = unusedYellow.length > 0 ? unusedYellow : availableWords;
      randomWord = yellowPool[Math.floor(Math.random() * yellowPool.length)];
      wordSource = "yellow";
    } else if (masteredWords.length > 0) {
      const unusedGreen = masteredWords.filter(w => w && w.word && !usedWords.has(w.word.toLowerCase()));
      const greenPool = unusedGreen.length > 0 ? unusedGreen : masteredWords;
      randomWord = greenPool[Math.floor(Math.random() * greenPool.length)];
      wordSource = "green";
    } else {
      notify("📖 Không có từ nào để trồng! Hãy thêm từ vào Sổ tay nhé!", "#ef4444");
      return;
    }

    const crop2 = crop;
    setPlots((prev) =>
      prev.map((p) =>
        p.id === plotId ? { 
          ...p, crop: crop2.id, stage: 1, hasPest: false, 
          linkedWord: randomWord.word, wordData: randomWord, timeLeft: crop2.growTime,
          wordSource: wordSource,
        } : p
      )
    );
    setSeeds((s) => s - 1);
    const sourceLabel = wordSource === "yellow" ? "ô vàng" : "ô xanh (ôn lại)";
    notify(`🌱 Đã gieo "${randomWord.word}" (${sourceLabel}) vào ruộng! [${currentSeedCount+1}/${dynamicMax} ${crop2.emoji}]`, "#22c55e");
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
    const baseReward = crop ? crop.reward : 10;
    const expReward = crop ? crop.expReward : 5;
    const wMult = WEATHER_TYPES[weather]?.rewardMult ?? 1.0;
    const bonus = wMult > 1 ? Math.floor(baseReward * (wMult - 1)) : 0;
    const total = Math.floor(baseReward * wMult);
    
    setCoins((c) => c + total);
    setSeeds((s) => s + 1);
    setScore((sc) => sc + 1);
    setWordsMastered(prev => prev + 1);
    
    const isFromGreen = plot.wordSource === "green"; // từ ô xanh thì không move

    // NHẬN NÔNG SẢN VÀO KHO
    if (crop && crop.produce) {
      const { id: produceId, name: produceName, emoji: produceEmoji, qty } = crop.produce;
      const weatherQtyBonus = wMult >= 1.3 ? 1 : 0; // mưa bonus thêm 1 nông sản
      const totalQty = qty + weatherQtyBonus;
      setProduceInventory(prev => ({ ...prev, [produceId]: (prev[produceId] || 0) + totalQty }));
      notify(`🎉 Thu hoạch! +${total}🪙 +${expReward}EXP +${totalQty}${produceEmoji} ${produceName}${weatherQtyBonus ? " (🌧️ bonus!)" : ""}`, "#f59e0b");
    } else {
      const moveNote = isFromGreen ? "(ôn lại từ ô xanh)" : `Từ "${wordData.word}" đã chuyển vào Ô xanh!`;
      notify(`🎉 Thu hoạch thành công! +${total}🪙 +${expReward} EXP. ${moveNote}`, "#f59e0b");
    }
    
    // NHẬN EXP
    addExp(expReward);
    
    setPlots((prev) =>
      prev.map((p) =>
        p.id === plotId ? { ...p, crop: null, stage: 0, hasPest: false, linkedWord: null, wordData: null, timeLeft: 0, wordSource: null } : p
      )
    );
    
    if (!isFromGreen && onMoveWord && wordData) {
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

      if (quizMode === "livestock_harvest") {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      const isCorrect = opt === livestockQuizState?.question?.answer;
      const animalSnapshot = livestock.find(a => a.id === livestockQuizState?.animalId) || null;
      setAnswered(true);
      setChosenOpt(opt);
      // Chạy logic harvest ngay (coins, produce, move word...) nhưng KHÔNG reset UI/tab
      // Việc chuyển tab để nút "Tiếp tục" xử lý để người chơi kịp đọc kết quả
      completeLivestockHarvest(animalSnapshot, isCorrect);
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
    setSeason(getSeasonFromDayOfYear(toDayOfYear(1, 1)));
    setWeatherTimer(60);
    setInventory({});
    setProduceInventory({});
    // Reset lịch nông trại
    setFarmDay(1); setFarmMonth(1); setFarmYear(1);
    setDailyGemCrop(getDailyGemCropId(1, toDayOfYear(1, 1)));
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

  const w = WEATHER_TYPES[weather] || WEATHER_TYPES.sunny;
  const s = SEASONS[season] || SEASONS.spring;

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

  // ===== PRE-COMPUTE PARTICLE POSITIONS — phải đặt TRƯỚC mọi early return =====
  const springPetals = useMemo(() => Array.from({length:18}, (_,i) => ({
    left: `${(i * 5.7 + Math.sin(i*2.3)*8 + 3)}%`,
    delay: `${(i * 0.38) % 3.2}s`,
    dur: `${4.5 + Math.sin(i*1.7)*1.2}s`,
    size: `${20 + (i%4)*5}px`,
    emoji: i%5===0 ? "🌺" : "🌸",
  })), []);

  const autumnLeaves = useMemo(() => Array.from({length:18}, (_,i) => ({
    left: `${(i * 5.4 + Math.sin(i*1.9)*9 + 2)}%`,
    delay: `${(i * 0.35) % 3.0}s`,
    dur: `${4.0 + Math.sin(i*2.1)*1.0}s`,
    size: `${20 + (i%4)*5}px`,
    emoji: i%3===0 ? "🍁" : i%3===1 ? "🍂" : "🍃",
  })), []);

  const snowflakes = useMemo(() => Array.from({length:20}, (_,i) => ({
    left: `${(i * 5.0 + Math.sin(i*2.5)*7)}%`,
    delay: `${(i * 0.28) % 2.8}s`,
    dur: `${3.5 + Math.sin(i*1.3)*0.8}s`,
    size: `${14 + (i%3)*5}px`,
    opacity: 0.55 + (i%4)*0.1,
  })), []);

  const rainDrops = useMemo(() => Array.from({length:28}, (_,i) => ({
    left: `${(i * 3.6 + Math.sin(i*1.1)*4)}%`,
    delay: `${(i * 0.07) % 0.9}s`,
    dur: `${0.55 + Math.sin(i*2.2)*0.1}s`,
    h: `${16 + (i%5)*4}px`,
  })), []);

  const stormDrops = useMemo(() => Array.from({length:35}, (_,i) => ({
    left: `${(i * 2.9 + Math.sin(i*1.4)*5)}%`,
    delay: `${(i * 0.055) % 0.7}s`,
    dur: `${0.35 + Math.sin(i*1.8)*0.08}s`,
    h: `${22 + (i%6)*4}px`,
  })), []);

  const lightningBolts = useMemo(() => [
    { left: "22%", delay: "0s",   dur: "4.5s" },
    { left: "58%", delay: "1.8s", dur: "5.2s" },
    { left: "79%", delay: "3.1s", dur: "3.8s" },
  ], []);

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
      background: s.bg, transition: "background 2s ease", boxSizing: "border-box",
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
    tabBar: { display: "none" },
    tab: () => ({}),
    alertChip: (bg, color) => ({
      background: bg, color, padding: "4px 11px", borderRadius: "10px",
      fontWeight: "800", fontSize: "12px", marginLeft: "4px",
    }),
    iconGrid: {
      position: "fixed",
      bottom: "32px",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 200,
      display: "flex",
      flexDirection: "row",
      gap: "14px",
      alignItems: "flex-end",
      padding: "14px 20px",
      background: "rgba(255,255,255,0.25)",
      backdropFilter: "blur(16px)",
      borderRadius: "30px",
      boxShadow: "0 8px 32px rgba(0,0,0,0.15), 0 0 0 1px rgba(255,255,255,0.4)",
    },
    iconBtn: (bg, color) => ({
      width: "68px", height: "68px",
      borderRadius: "50%",
      background: bg,
      boxShadow: `0 6px 20px ${color}55`,
      cursor: "pointer",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: "2px",
      transition: "transform 0.15s cubic-bezier(.34,1.56,.64,1), box-shadow 0.15s",
      outline: "none",
    }),
    backToFarmBtn: {
      display: "inline-flex", alignItems: "center", gap: "6px",
      background: "rgba(255,255,255,0.88)",
      backdropFilter: "blur(10px)",
      border: "2px solid rgba(22,163,74,0.3)",
      borderRadius: "20px",
      padding: "8px 18px",
      fontWeight: "800", fontSize: "14px",
      color: "#16a34a",
      cursor: "pointer", fontFamily: "inherit",
      marginBottom: "14px",
      boxShadow: "0 3px 12px rgba(0,0,0,0.1)",
      transition: "all 0.15s",
    },
    main: { flex: 1, overflowY: "auto", padding: "12px 20px 120px 20px", display: "flex", flexDirection: "column" },
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
      {/* ===== NGÀY / ĐÊM OVERLAY — hệ thống arc mặt trời/trăng ===== */}
      {(() => {
        // ── Thời gian dạng số thực (giờ + phút/60) ──
        const timeH = farmHour + farmMinute / 60;

        // ── Pha mặt trăng theo ngày trong năm (dayOfYear 1–360) ──
        // Chu kỳ trăng: 29.5 ngày. Dùng dayOfYear để tính pha.
        // Ngày 0 = trăng mới (không có trăng), ngày 7 = bán nguyệt, ngày 15 = trăng tròn
        const lunarCycle = 29.5;
        const dayInCycle = ((toDayOfYear(farmMonth, farmDay) - 1) % lunarCycle);
        const moonPhase = dayInCycle / lunarCycle; // 0..1
        // Ngày trăng mới (0–1.5 ngày) → không hiện trăng
        const noMoon = dayInCycle < 1.5 || dayInCycle > 28;

        // ── Tính % chiếu sáng mặt trăng (0 = trăng mới, 1 = trăng tròn) ──
        // Sử dụng sin để tạo cong tự nhiên
        const moonIllum = Math.abs(Math.sin(moonPhase * Math.PI)); // 0→1→0

        // ── Vị trí arc mặt trời: 5h30 → 17h30 ──
        // t = 0 tại 5h30, t = 1 tại 17h30 (12 giờ)
        const sunRise = 5.5, sunSet = 17.5;
        const sunDuration = sunSet - sunRise; // 12h
        const sunT = Math.max(0, Math.min(1, (timeH - sunRise) / sunDuration));
        // Arc hình cung sin: x từ 3%→97%, y = đỉnh 4% ở 12h, thấp 85% ở 2 đầu
        const sunX = sunT * 94 + 3; // % từ trái sang phải
        const sunY = 28 - Math.sin(sunT * Math.PI) * 22; // % top: thấp nhất 28%, đỉnh 6%
        const sunVisible = timeH >= sunRise && timeH <= sunSet;

        // Màu mặt trời theo giờ: bình minh/hoàng hôn đỏ cam, ban ngày vàng trắng
        const sunColorT = Math.sin(sunT * Math.PI); // 0→1→0 (đỉnh = giữa trưa)
        const sunR = Math.round(255);
        const sunG = Math.round(180 + sunColorT * 70); // 180→250→180
        const sunB = Math.round(50 + sunColorT * 100);  // 50→150→50
        const sunGlow = `rgba(${sunR},${sunG},${sunB},`;

        // ── Vị trí arc mặt trăng: 17h30 → 5h30 hôm sau (12 giờ đêm) ──
        const moonRise = 17.5;
        // Giờ ban đêm: đổi về 0–12 để tính t
        let moonTimeH = timeH;
        if (timeH < moonRise) moonTimeH = timeH + 24; // wrap qua nửa đêm
        const moonDuration = 12;
        const moonT = Math.max(0, Math.min(1, (moonTimeH - moonRise) / moonDuration));
        const moonX = moonT * 94 + 3;
        const moonY = 28 - Math.sin(moonT * Math.PI) * 22;
        const moonVisible = !noMoon && (timeH >= moonRise || timeH <= sunRise);

        // ── Ánh sáng ambient theo giờ ──
        // 0=đêm sâu → 0.55 tối, 5.5–17.5=ngày → 0, chuyển mượt
        let nightOpacity = 0;
        if (timeH >= 0 && timeH < sunRise) {
          // Đêm → bình minh: tối dần từ 0.55 → 0
          const t = timeH / sunRise;
          nightOpacity = 0.55 * (1 - Math.pow(t, 1.5));
        } else if (timeH >= sunRise && timeH < 7) {
          // Bình minh: 0 → trong sáng
          nightOpacity = 0.05 * (1 - (timeH - sunRise) / 1.5);
        } else if (timeH >= 7 && timeH < sunSet - 1) {
          nightOpacity = 0; // ban ngày
        } else if (timeH >= sunSet - 1 && timeH <= sunSet + 1) {
          // Hoàng hôn 16h30–18h30
          const t = (timeH - (sunSet - 1)) / 2;
          nightOpacity = t * 0.15;
        } else if (timeH > sunSet + 1) {
          // Tối dần sau hoàng hôn
          const t = Math.min(1, (timeH - sunSet - 1) / 4);
          nightOpacity = 0.15 + t * 0.40;
        }

        // Màu hoàng hôn/bình minh
        let sunsetAlpha = 0;
        let sunsetX = "50%", sunsetY = "5%";
        if (timeH >= sunRise && timeH < sunRise + 1.5) {
          sunsetAlpha = 0.30 * (1 - (timeH - sunRise) / 1.5);
          sunsetX = `${sunX}%`; sunsetY = `${sunY}%`;
        } else if (timeH >= sunSet - 1 && timeH <= sunSet + 1) {
          sunsetAlpha = 0.35 * Math.sin(((timeH - (sunSet-1)) / 2) * Math.PI);
          sunsetX = `${sunX}%`; sunsetY = `${sunY}%`;
        }

        // ── SVG mặt trăng với pha ──
        // Dùng SVG clip path để vẽ lưỡi liềm / bán nguyệt / tròn
        const moonSize = 44;
        const moonSVG = (() => {
          if (noMoon) return null;
          const r = moonSize / 2;
          const illum = moonIllum; // 0..1
          // illum < 0.5: trăng khuyết (lưỡi liềm), > 0.5: trăng lớn
          // Vẽ trăng dùng 2 đường tròn overlap
          const cx = r, cy = r;
          // Bán kính hình tròn che: khi illum=0 → che hoàn toàn, illum=1 → không che
          const shadowR = r;
          // Offset tâm hình che: dịch từ phải sang trái khi trăng lớn dần
          const shadowOffsetX = r - illum * r * 2; // -r→+r
          const moonFill = "#fffde7";
          const shadowFill = "#0a0f28";
          return (
            <svg width={moonSize} height={moonSize} style={{overflow:"visible",display:"block"}}>
              <defs>
                <clipPath id="moonClip">
                  <circle cx={cx} cy={cy} r={r} />
                </clipPath>
              </defs>
              {/* Nền trăng sáng */}
              <circle cx={cx} cy={cy} r={r} fill={moonFill} />
              {/* Bóng che tạo pha */}
              {illum < 0.98 && (
                <circle
                  cx={cx + shadowOffsetX}
                  cy={cy}
                  r={shadowR}
                  fill={shadowFill}
                  clipPath="url(#moonClip)"
                  opacity={0.88}
                />
              )}
              {/* Texture mặt trăng */}
              <circle cx={cx-4} cy={cy-3} r={2.5} fill="rgba(0,0,0,0.07)" clipPath="url(#moonClip)" />
              <circle cx={cx+3} cy={cy+4} r={1.8} fill="rgba(0,0,0,0.06)" clipPath="url(#moonClip)" />
              <circle cx={cx+5} cy={cy-5} r={1.2} fill="rgba(0,0,0,0.05)" clipPath="url(#moonClip)" />
            </svg>
          );
        })();

        return (
          <>
            {/* Overlay tối ban đêm */}
            {nightOpacity > 0 && (
              <div style={{
                position:"fixed",inset:0,pointerEvents:"none",zIndex:48,
                background:`linear-gradient(180deg, rgba(10,15,50,${nightOpacity}) 0%, rgba(5,10,35,${nightOpacity*0.7}) 100%)`,
                transition:"background 3s ease",
              }}/>
            )}

            {/* Overlay hoàng hôn / bình minh */}
            {sunsetAlpha > 0 && (
              <div style={{
                position:"fixed",inset:0,pointerEvents:"none",zIndex:47,
                background:`radial-gradient(ellipse at ${sunsetX} ${sunsetY}, rgba(255,110,40,${sunsetAlpha}) 0%, rgba(255,60,0,${sunsetAlpha*0.5}) 35%, transparent 70%)`,
                transition:"background 3s ease",
              }}/>
            )}

            {/* Mặt trời — arc từ trái sang phải */}
            {sunVisible && (
              <div style={{
                position:"fixed",
                left:`calc(${sunX}% - 28px)`,
                top:`calc(${sunY}% - 28px)`,
                width:"56px",height:"56px",
                background:`radial-gradient(circle at 40% 38%, #fff9c4, ${sunGlow}1) 55%, rgba(255,160,0,0.8))`,
                borderRadius:"50%",
                boxShadow:`0 0 ${16+sunColorT*20}px ${sunGlow}0.7), 0 0 ${40+sunColorT*40}px ${sunGlow}0.3)`,
                pointerEvents:"none",zIndex:46,
                animation:"sunGlow 4s ease-in-out infinite",
                transition:"left 6s linear, top 6s linear",
              }}/>
            )}

            {/* Sao và mặt trăng ban đêm */}
            {nightOpacity > 0.08 && (
              <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:49,overflow:"hidden"}}>
                {/* Sao */}
                {[
                  {x:12,y:6,s:1.8},{x:28,y:4,s:1.2},{x:45,y:8,s:2.2},{x:62,y:3,s:1.5},
                  {x:75,y:9,s:2},{x:88,y:5,s:1.2},{x:20,y:14,s:1},{x:52,y:16,s:1.5},
                  {x:70,y:12,s:1},{x:38,y:19,s:1.8},{x:83,y:18,s:1.3},{x:6,y:22,s:1},
                  {x:33,y:25,s:0.9},{x:58,y:22,s:1.4},{x:92,y:15,s:1.8},{x:48,y:11,s:0.8},
                ].map((star,i) => (
                  <div key={i} style={{
                    position:"absolute",
                    left:`${star.x}%`,top:`${star.y}%`,
                    width:`${star.s}px`,height:`${star.s}px`,
                    background:"white",borderRadius:"50%",
                    opacity: Math.min(1, (nightOpacity - 0.08) * 3) * (0.6 + Math.sin(i)*0.4),
                    animation:`bgStars ${2.2+i*0.25}s ease-in-out ${i*0.35}s infinite`,
                  }}/>
                ))}

                {/* Mặt trăng — arc từ trái sang phải ban đêm */}
                {moonVisible && moonSVG && (
                  <div style={{
                    position:"fixed",
                    left:`calc(${moonX}% - 22px)`,
                    top:`calc(${moonY}% - 22px)`,
                    width:`${moonSize}px`,height:`${moonSize}px`,
                    filter:`drop-shadow(0 0 ${6+moonIllum*12}px rgba(255,240,180,${0.4+moonIllum*0.5}))`,
                    opacity: Math.min(1, (nightOpacity - 0.05) * 4),
                    transition:"left 6s linear, top 6s linear, opacity 3s",
                    pointerEvents:"none",
                    zIndex:50,
                  }}>
                    {moonSVG}
                  </div>
                )}
              </div>
            )}
          </>
        );
      })()}

      {/* ===== CHUYỂN MÙA ANIMATION ===== */}
      {seasonTransition && (
        <div style={{
          position:"fixed",inset:0,pointerEvents:"none",zIndex:2000,
          display:"flex",alignItems:"center",justifyContent:"center",
          animation:"seasonFlashIn 4s ease-out forwards",
        }}>
          <div style={{
            background:`radial-gradient(ellipse at center, ${seasonTransition.color}88 0%, ${seasonTransition.color}44 50%, transparent 75%)`,
            position:"absolute",inset:0,
          }}/>
          <div style={{
            textAlign:"center",zIndex:1,
            animation:"seasonTextPop 4s ease-out forwards",
          }}>
            <div style={{fontSize:"80px",filter:`drop-shadow(0 0 40px ${seasonTransition.color})`}}>
              {seasonTransition.emoji}
            </div>
            <div style={{
              fontSize:"28px",fontWeight:"900",color:"white",
              textShadow:`0 0 30px ${seasonTransition.color}, 0 2px 8px rgba(0,0,0,0.5)`,
              marginTop:"12px",letterSpacing:"2px",
            }}>
              MÙA {seasonTransition.name.toUpperCase()} ĐÃ ĐẾN!
            </div>
          </div>
        </div>
      )}

      {/* ===== WEATHER OVERLAY ===== */}

      {/* SUNNY — màn hình sáng, tia nắng */}
      {weather === "sunny" && (
        <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:50,overflow:"hidden"}}>
          <div style={{
            position:"absolute",inset:0,
            background:"radial-gradient(ellipse at 65% 0%,rgba(255,240,120,0.20) 0%,transparent 60%)",
            animation:"sunBrighten 4s ease-in-out infinite",
          }}/>
          {[0,1,2,3,4].map(i=>(
            <div key={i} style={{
              position:"absolute",top:"-20%",left:"64%",
              width:"2px",height:"160%",
              background:"linear-gradient(180deg,rgba(255,230,80,0.28),transparent 65%)",
              transformOrigin:"top center",
              transform:`rotate(${i*16-18}deg)`,
              animation:`sunRay ${3+i*0.6}s ease-in-out ${i*0.55}s infinite alternate`,
            }}/>
          ))}
        </div>
      )}

      {/* CLOUDY — tối lại + mây trôi */}
      {weather === "cloudy" && (
        <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:50,overflow:"hidden"}}>
          <div style={{
            position:"absolute",inset:0,
            background:"rgba(45,55,75,0.30)",
            animation:"cloudDim 6s ease-in-out infinite",
          }}/>
          {[
            {top:"5%",  size:200, delay:"0s",  dur:"20s", opacity:0.50},
            {top:"12%", size:150, delay:"5s",  dur:"25s", opacity:0.40},
            {top:"2%",  size:240, delay:"11s", dur:"30s", opacity:0.35},
          ].map((c,i)=>(
            <div key={i} style={{
              position:"absolute",top:c.top,left:"-280px",
              width:`${c.size}px`,height:`${c.size*0.55}px`,
              background:"radial-gradient(ellipse at 40% 50%,rgba(170,185,205,0.90),rgba(130,148,175,0.3) 70%,transparent)",
              borderRadius:"50%",opacity:c.opacity,
              animation:`cloudMove ${c.dur} linear ${c.delay} infinite`,
              filter:"blur(10px)",
            }}/>
          ))}
        </div>
      )}

      {/* RAINY — tối + mây nặng + 2 lớp mưa */}
      {weather === "rainy" && (
        <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:50,overflow:"hidden"}}>
          {/* Lớp tối */}
          <div style={{position:"absolute",inset:0,background:"rgba(25,38,62,0.42)"}}/>
          {/* Mây xám trên đỉnh */}
          <div style={{
            position:"absolute",top:0,left:0,right:0,height:"25%",
            background:"linear-gradient(180deg,rgba(50,60,85,0.80) 0%,transparent 100%)",
          }}/>
          {/* Layer mưa 1 — mảnh, xa */}
          {rainDrops.map((d,i)=>(
            <div key={`r1-${i}`} style={{
              position:"absolute",left:d.left,top:"-30px",
              width:"1px",height:`${parseInt(d.h)*0.7}px`,
              background:"linear-gradient(180deg,transparent,rgba(150,195,255,0.50))",
              animation:`rainFall ${(parseFloat(d.dur)*1.5).toFixed(2)}s linear ${d.delay} infinite`,
              transform:"rotate(12deg)",
            }}/>
          ))}
          {/* Layer mưa 2 — to, gần */}
          {rainDrops.map((d,i)=>(
            <div key={`r2-${i}`} style={{
              position:"absolute",
              left:`${(parseFloat(d.left)+2.5).toFixed(1)}%`,
              top:"-30px",
              width:"1.8px",height:d.h,
              background:"linear-gradient(180deg,transparent,rgba(110,165,255,0.85))",
              animation:`rainFall ${d.dur} linear ${(parseFloat(d.delay)+0.18).toFixed(2)}s infinite`,
              transform:"rotate(12deg)",
            }}/>
          ))}
          {/* Gợn nước đáy */}
          <div style={{
            position:"absolute",bottom:0,left:0,right:0,height:"5px",
            background:"linear-gradient(90deg,transparent,rgba(110,175,255,0.35),transparent)",
            animation:"rainPuddle 1.8s ease-in-out infinite",
          }}/>
        </div>
      )}

      {/* STORMY — rất tối + mưa nặng + sét */}
      {weather === "stormy" && (
        <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:50,overflow:"hidden"}}>
          {/* Tối đậm */}
          <div style={{position:"absolute",inset:0,background:"rgba(12,18,32,0.65)"}}/>
          {/* Mây bão đen */}
          <div style={{
            position:"absolute",top:0,left:0,right:0,height:"32%",
            background:"linear-gradient(180deg,rgba(15,20,38,0.92) 0%,rgba(35,42,62,0.55) 65%,transparent 100%)",
            animation:"stormCloud 7s ease-in-out infinite",
          }}/>
          {/* Mưa bão layer 1 */}
          {stormDrops.map((d,i)=>(
            <div key={`s1-${i}`} style={{
              position:"absolute",left:d.left,top:"-30px",
              width:"1.2px",height:`${parseInt(d.h)*0.75}px`,
              background:"linear-gradient(180deg,transparent,rgba(130,155,200,0.55))",
              animation:`rainFall ${(parseFloat(d.dur)*1.3).toFixed(2)}s linear ${d.delay} infinite`,
              transform:"rotate(22deg)",
            }}/>
          ))}
          {/* Mưa bão layer 2 — nặng */}
          {stormDrops.map((d,i)=>(
            <div key={`s2-${i}`} style={{
              position:"absolute",
              left:`${(parseFloat(d.left)+1.8).toFixed(1)}%`,
              top:"-30px",
              width:"2.5px",height:d.h,
              background:"linear-gradient(180deg,transparent,rgba(95,125,200,0.90))",
              animation:`rainFall ${d.dur} linear ${(parseFloat(d.delay)+0.09).toFixed(2)}s infinite`,
              transform:"rotate(22deg)",
            }}/>
          ))}
          {/* 3 tia sét */}
          {lightningBolts.map((b,i)=>(
            <div key={`bolt-${i}`} style={{
              position:"absolute",left:b.left,top:"0",
              width:"4px",height:"42%",
              background:"linear-gradient(180deg,rgba(255,255,255,0.98),rgba(180,205,255,0.65),transparent)",
              clipPath:"polygon(42% 0%,58% 0%,54% 38%,72% 38%,28% 100%,40% 52%,18% 52%)",
              filter:"drop-shadow(0 0 6px white) drop-shadow(0 0 18px rgba(160,185,255,0.95))",
              animation:`lightning ${b.dur} ease-in ${b.delay} infinite`,
            }}/>
          ))}
          {/* Flash màn hình theo từng tia sét */}
          {lightningBolts.map((b,i)=>(
            <div key={`flash-${i}`} style={{
              position:"absolute",inset:0,
              background:"rgba(210,225,255,0)",
              animation:`lightningFlash ${b.dur} ease-in ${b.delay} infinite`,
            }}/>
          ))}
        </div>
      )}

      {/* MÙA — hoa/lá/tuyết rơi (layer riêng, không bị thời tiết che) */}
      {season === "winter" && (
        <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:51,overflow:"hidden"}}>
          {snowflakes.map((f,i)=>(
            <div key={i} style={{
              position:"absolute",left:f.left,top:"-30px",
              fontSize:f.size,opacity:f.opacity,
              animation:`flakefall ${f.dur} linear ${f.delay} infinite`,
            }}>❄️</div>
          ))}
        </div>
      )}
      {season === "spring" && (
        <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:51,overflow:"hidden"}}>
          {springPetals.map((p,i)=>(
            <div key={i} style={{
              position:"absolute",left:p.left,top:"-40px",
              fontSize:p.size,opacity:0.78,
              animation:`petalFall ${p.dur} ease-in ${p.delay} infinite`,
              filter:"drop-shadow(0 2px 4px rgba(255,150,180,0.4))",
            }}>{p.emoji}</div>
          ))}
        </div>
      )}
      {season === "autumn" && (
        <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:51,overflow:"hidden"}}>
          {autumnLeaves.map((l,i)=>(
            <div key={i} style={{
              position:"absolute",left:l.left,top:"-40px",
              fontSize:l.size,opacity:0.82,
              animation:`leafFall ${l.dur} ease-in ${l.delay} infinite`,
              filter:"drop-shadow(0 2px 4px rgba(200,100,0,0.3))",
            }}>{l.emoji}</div>
          ))}
        </div>
      )}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@600;700;800;900&display=swap');
        html, body { margin: 0; padding: 0; overflow: hidden; height: 100%; }
        * { box-sizing: border-box; }
        @keyframes popIn { from{opacity:0;transform:scale(0.8)} to{opacity:1;transform:scale(1)} }
        @keyframes seasonFlashIn {
          0%   { opacity: 0; }
          15%  { opacity: 1; }
          70%  { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes seasonTextPop {
          0%   { opacity: 0; transform: scale(0.5) translateY(30px); }
          20%  { opacity: 1; transform: scale(1.1) translateY(0px); }
          35%  { transform: scale(1) translateY(0px); }
          80%  { opacity: 1; transform: scale(1) translateY(0px); }
          100% { opacity: 0; transform: scale(0.8) translateY(-20px); }
        }
        @keyframes dayNightFade {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 1; }
        }
        @keyframes clockTick {
          0%   { transform: scale(1); }
          50%  { transform: scale(1.03); }
          100% { transform: scale(1); }
        }
        @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
        @keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-3px)} 75%{transform:translateX(3px)} }
        @keyframes harvestPop { 0%{opacity:0;transform:translateY(0) scale(0.5)} 50%{opacity:1;transform:translateY(-28px) scale(1.2)} 100%{opacity:0;transform:translateY(-58px) scale(0.8)} }
        @keyframes rainFall {
          0%   { transform: translateY(-30px) rotate(12deg); opacity: 0; }
          6%   { opacity: 1; }
          94%  { opacity: 0.85; }
          100% { transform: translateY(112vh) rotate(12deg); opacity: 0; }
        }
        @keyframes sunBrighten {
          0%,100% { opacity: 0.65; }
          50%     { opacity: 1; }
        }
        @keyframes sunRay {
          from { opacity: 0.12; transform: rotate(0deg) scaleY(0.88); }
          to   { opacity: 0.42; transform: rotate(0deg) scaleY(1.12); }
        }
        @keyframes cloudDim {
          0%,100% { opacity: 0.80; }
          50%     { opacity: 1; }
        }
        @keyframes cloudMove {
          0%   { transform: translateX(0); }
          100% { transform: translateX(calc(100vw + 300px)); }
        }
        @keyframes stormCloud {
          0%,100% { opacity: 0.88; transform: scaleX(1); }
          50%     { opacity: 1;    transform: scaleX(1.05); }
        }
        @keyframes lightning {
          0%,7%,100%  { opacity: 0; }
          2%          { opacity: 1; }
          4%          { opacity: 0.25; }
          5%          { opacity: 0.92; }
          6%          { opacity: 0; }
        }
        @keyframes lightningFlash {
          0%,7%,100%  { background: rgba(210,225,255,0); }
          2%          { background: rgba(210,225,255,0.38); }
          4%          { background: rgba(210,225,255,0.07); }
          5%          { background: rgba(210,225,255,0.30); }
        }
        @keyframes rainPuddle {
          0%,100% { opacity: 0.35; transform: scaleX(0.97); }
          50%     { opacity: 0.75; transform: scaleX(1.03); }
        }
        @keyframes stormFlash { 0%,100%{opacity:0.5} 48%,52%{opacity:1} 50%{opacity:0.2} }
        @keyframes sunGlow    { 0%,100%{transform:scale(1);opacity:0.7} 50%{transform:scale(1.3);opacity:1} }
        @keyframes petalFall {
          0%   { transform: translateY(-40px) rotate(0deg) translateX(0px); opacity: 0; }
          8%   { opacity: 0.85; }
          25%  { transform: translateY(22vh) rotate(60deg) translateX(18px); }
          50%  { transform: translateY(48vh) rotate(140deg) translateX(-14px); }
          75%  { transform: translateY(74vh) rotate(220deg) translateX(20px); }
          92%  { opacity: 0.7; }
          100% { transform: translateY(110vh) rotate(300deg) translateX(-10px); opacity: 0; }
        }
        @keyframes leafFall {
          0%   { transform: translateY(-40px) rotate(0deg) translateX(0px); opacity: 0; }
          8%   { opacity: 0.85; }
          20%  { transform: translateY(18vh) rotate(80deg) translateX(22px); }
          45%  { transform: translateY(44vh) rotate(180deg) translateX(-18px); }
          70%  { transform: translateY(70vh) rotate(260deg) translateX(24px); }
          92%  { opacity: 0.7; }
          100% { transform: translateY(110vh) rotate(360deg) translateX(-12px); opacity: 0; }
        }
        @keyframes flakefall {
          0%   { transform: translateY(-30px) translateX(0px); opacity: 0; }
          8%   { opacity: 0.7; }
          30%  { transform: translateY(28vh) translateX(10px); }
          60%  { transform: translateY(58vh) translateX(-8px); }
          92%  { opacity: 0.5; }
          100% { transform: translateY(110vh) translateX(6px); opacity: 0; }
        }
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

      <div style={{...S.weatherBar, position:"relative", overflow:"hidden"}}>
        {/* Weather overlay effect */}
        {weather === "rainy" && (
          <div style={{position:"absolute",inset:0,pointerEvents:"none",overflow:"hidden",zIndex:0}}>
            {Array.from({length:12}).map((_,i)=>(
              <div key={i} style={{
                position:"absolute",left:`${i*9+Math.random()*5}%`,top:0,
                width:"1px",height:"100%",
                background:"linear-gradient(180deg,transparent,rgba(100,180,255,0.6),transparent)",
                animation:`rainFall ${0.5+Math.sin(i*0.4+1)*0.15}s linear ${i*0.08}s infinite`,
              }}/>
            ))}
          </div>
        )}
        {weather === "stormy" && (
          <div style={{position:"absolute",inset:0,pointerEvents:"none",zIndex:0,
            background:"linear-gradient(90deg,rgba(80,0,120,0.07),transparent,rgba(80,0,120,0.07))",
            animation:"stormFlash 2s ease-in-out infinite"}}>
          </div>
        )}
        {weather === "sunny" && (
          <div style={{position:"absolute",right:"-10px",top:"-10px",width:"50px",height:"50px",
            background:"radial-gradient(circle,rgba(255,220,0,0.25),transparent 70%)",
            borderRadius:"50%",animation:"sunGlow 3s ease-in-out infinite",pointerEvents:"none",zIndex:0}}/>
        )}
        {/* Season badge */}
        <span style={{display:"flex",alignItems:"center",gap:"8px",position:"relative",zIndex:1,flexWrap:"wrap"}}>
          {/* Lịch nông trại */}
          <span style={{
            background:"rgba(255,255,255,0.7)",
            border:"1px solid rgba(0,0,0,0.1)",
            borderRadius:"20px",padding:"3px 10px",
            fontWeight:"800",fontSize:"11px",color:"#374151",
            display:"flex",alignItems:"center",gap:"4px",
          }}>
            📅 {String(farmDay).padStart(2,"0")}/{String(farmMonth).padStart(2,"0")}/{farmYear}
            <span style={{
              fontSize:"11px",fontWeight:"900",
              color: farmHour >= 5 && farmHour < 12 ? "#f97316"
                   : farmHour >= 12 && farmHour < 17 ? "#eab308"
                   : farmHour >= 17 && farmHour < 20 ? "#f97316"
                   : "#6366f1",
              marginLeft:"4px",
              background: farmHour >= 5 && farmHour < 12 ? "rgba(249,115,22,0.1)"
                        : farmHour >= 12 && farmHour < 17 ? "rgba(234,179,8,0.1)"
                        : farmHour >= 17 && farmHour < 20 ? "rgba(249,115,22,0.08)"
                        : "rgba(99,102,241,0.12)",
              borderRadius:"12px", padding:"1px 7px",
            }}>
              {farmHour >= 5 && farmHour < 12 ? "🌅" : farmHour >= 12 && farmHour < 17 ? "☀️" : farmHour >= 17 && farmHour < 20 ? "🌇" : "🌙"}
              {" "}{String(farmHour).padStart(2,"0")}:{String(farmMinute).padStart(2,"0")}
            </span>
          </span>
          {/* Season indicator */}
          <span style={{
            background:`linear-gradient(135deg,${s.color}33,${s.color}22)`,
            border:`1px solid ${s.color}66`,
            borderRadius:"20px",padding:"3px 10px",
            fontWeight:"800",fontSize:"12px",color:s.color,
            display:"flex",alignItems:"center",gap:"4px",
          }}>
            {s.icon} Mùa {s.name}
            <span style={{fontSize:"9px",opacity:0.7,marginLeft:"2px"}}>
              còn {daysLeftInSeason(toDayOfYear(farmMonth, farmDay))} ngày
            </span>
          </span>
          {/* Cây gem hôm nay */}
          {dailyGemCrop && (() => {
            const gc = CROP_TYPES.find(c => c.id === dailyGemCrop);
            return gc ? (
              <span style={{
                background:"linear-gradient(135deg,#fef3c7,#fde68a)",
                border:"1px solid #f59e0b",
                borderRadius:"20px",padding:"3px 10px",
                fontWeight:"800",fontSize:"11px",color:"#92400e",
                display:"flex",alignItems:"center",gap:"4px",
              }}>
                {gc.emoji} 💎 hôm nay
              </span>
            ) : null;
          })()}
          {/* Weather indicator */}
          <span style={{
            background:"rgba(255,255,255,0.6)",
            border:"1px solid rgba(0,0,0,0.08)",
            borderRadius:"20px",padding:"3px 10px",
            fontWeight:"700",fontSize:"12px",color:"#374151",
            display:"flex",alignItems:"center",gap:"4px",
          }}>
            {w.emoji} {w.label}
            <span style={{fontSize:"9px",color:"#9ca3af"}}>— {w.tip}</span>
          </span>
          {/* Level */}
          <span style={{ background: "#f3e8ff", padding: "4px 12px", borderRadius: "20px", display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{fontSize:"12px",fontWeight:"800"}}>⭐ Cấp {level}</span>
            <div style={S.levelBar}>
              <div style={{ ...S.levelFill, width: `${expProgress}%` }} />
            </div>
            <span style={{ fontSize: "11px" }}>{exp}/{nextLevelExp}</span>
          </span>
        </span>
        <div style={{ display: "flex", gap: "10px", alignItems: "center", position:"relative",zIndex:1 }}>
          <span style={{ color: "#9ca3af", fontSize:"12px" }}>📚 Từ Ô vàng: {availableWords.length}</span>
          {expandInfo && (
            <button style={S.expandBtn} onClick={() => setShowExpandModal(true)}>
              🌍 Mở rộng ({plotCount}→{expandInfo.targetPlots}) {expandInfo.cost}🪙
            </button>
          )}
        </div>
      </div>

      {/* ===== 5 ICON TRÒN — chỉ hiện khi đang ở tab nông trại ===== */}
      {activePanel === "farm" && (
        <div style={S.iconGrid}>
          {[
            { id: "quiz",      emoji: "📝", label: "Học từ",   color: "#1d4ed8", bg: "linear-gradient(135deg,#3b82f6,#1d4ed8)" },
            { id: "shop",      emoji: "🏪", label: "Cửa hàng", color: "#7c3aed", bg: "linear-gradient(135deg,#a78bfa,#7c3aed)" },
            { id: "ancient",   emoji: "🌳", label: "Cổ thụ",   color: "#059669", bg: "linear-gradient(135deg,#34d399,#059669)" },
            { id: "livestock", emoji: "🐄", label: "Vật nuôi", color: "#ea580c", bg: "linear-gradient(135deg,#fb923c,#ea580c)" },
            { id: "quests",    emoji: "🏆", label: "Nhiệm vụ", color: "#d97706", bg: "linear-gradient(135deg,#fbbf24,#d97706)" },
          ].map((tab) => (
            <button
              key={tab.id}
              style={{ ...S.iconBtn(tab.bg, tab.color), border: "none", fontFamily: "inherit" }}
              onClick={() => { if (tab.id === "quiz") startQuiz(null); else setActivePanel(tab.id); }}
            >
              <span style={{ fontSize: "26px", lineHeight: 1 }}>{tab.emoji}</span>
              <span style={{ fontSize: "10px", fontWeight: "800", color: "white", marginTop: "3px", textShadow: "0 1px 3px rgba(0,0,0,0.3)" }}>{tab.label}</span>
            </button>
          ))}
        </div>
      )}


      <div style={S.main}>
        {/* Nút quay lại — chỉ hiện khi không ở tab nông trại */}
        {activePanel !== "farm" && (
          <button
            style={S.backToFarmBtn}
            onClick={() => setActivePanel("farm")}
          >
            ← Nông trại
          </button>
        )}
        {activePanel === "farm" && (
          <div>
            {/* Weather ambient overlay */}
            <div style={{position:"relative",marginBottom:"4px"}}>
              {weather === "rainy" && (
                <div style={{
                  background:"linear-gradient(135deg,rgba(59,130,246,0.08),rgba(147,197,253,0.12))",
                  border:"1px solid rgba(59,130,246,0.2)",
                  borderRadius:"12px",padding:"6px 12px",fontSize:"11px",
                  color:"#1d4ed8",fontWeight:"700",display:"flex",alignItems:"center",gap:"6px",marginBottom:"6px",
                }}>
                  🌧️ Trời đang mưa — Cây mọc nhanh hơn 30% và thu hoạch +50% xu!
                </div>
              )}
              {weather === "stormy" && (
                <div style={{
                  background:"linear-gradient(135deg,rgba(109,40,217,0.08),rgba(196,181,253,0.12))",
                  border:"1px solid rgba(109,40,217,0.2)",
                  borderRadius:"12px",padding:"6px 12px",fontSize:"11px",
                  color:"#7c3aed",fontWeight:"700",display:"flex",alignItems:"center",gap:"6px",marginBottom:"6px",
                }}>
                  ⛈️ Bão tố! — Cây mọc chậm hơn và sâu xuất hiện nhiều hơn. Cẩn thận!
                </div>
              )}
              {weather === "cloudy" && (
                <div style={{
                  background:"linear-gradient(135deg,rgba(107,114,128,0.08),rgba(209,213,219,0.15))",
                  border:"1px solid rgba(107,114,128,0.15)",
                  borderRadius:"12px",padding:"6px 12px",fontSize:"11px",
                  color:"#4b5563",fontWeight:"700",display:"flex",alignItems:"center",gap:"6px",marginBottom:"6px",
                }}>
                  ⛅ Trời âm u — Cây mọc chậm hơn 20% hôm nay.
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
                  if (isEmpty) { if (availableWords.length === 0) { notify("📖 Không có từ trong Ô vàng!", "#ef4444"); return; } if (seeds <= 0) { startQuiz(plot.id); return; } setPendingPlotId(plot.id); setShowCropPicker(true); return; }
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

            {/* ===== QUIZ THU HOẠCH VẬT NUÔI ===== */}
            {quizMode === "livestock_harvest" && livestockQuizState && (() => {
              const ltype = LIVESTOCK_TYPES.find(l => l.id === livestock.find(a => a.id === livestockQuizState.animalId)?.type);
              return (
                <div className="quiz-ancient-overlay">
                  <div style={{ width:"100%", maxWidth:"460px", marginBottom:"18px", display:"flex", flexDirection:"column", alignItems:"center", gap:"10px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:"10px", padding:"8px 20px", borderRadius:"20px", background:"rgba(249,115,22,0.12)", border:"1px solid rgba(249,115,22,0.4)" }}>
                      <span style={{fontSize:"24px"}}>{ltype?.adultEmoji || "🐄"}</span>
                      <span style={{fontWeight:"900", color:"#fb923c", fontSize:"15px"}}>
                        Thu hoạch — <span style={{color:"#ffd700"}}>{livestockQuizState.word}</span>
                      </span>
                    </div>
                    <div style={{position:"relative", width:"72px", height:"72px"}}>
                      <svg width="72" height="72" style={{transform:"rotate(-90deg)"}}>
                        <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="5"/>
                        <circle className="timer-ring" cx="36" cy="36" r="30" fill="none" stroke={timeLeft<=5?"#ef4444":"#fb923c"} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${2*Math.PI*30}`} strokeDashoffset={`${2*Math.PI*30*(1-timeLeft/15)}`}/>
                      </svg>
                      <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"20px",fontWeight:"900",color:timeLeft<=5?"#ef4444":"#fb923c"}}>{timeLeft}</div>
                    </div>
                  </div>
                  <div className="quiz-word-card" style={{width:"100%",maxWidth:"460px"}}>
                    <div style={{fontSize:"11px",color:"rgba(249,115,22,0.6)",textTransform:"uppercase",letterSpacing:"2px",marginBottom:"8px"}}>Nghĩa của từ này là gì?</div>
                    <div style={{fontSize:"34px",fontWeight:"900",color:"#fff",letterSpacing:"-1px",textShadow:"0 0 30px rgba(249,115,22,0.3)"}}>{livestockQuizState.question.word}</div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:"10px",width:"100%",maxWidth:"460px"}}>
                    {livestockQuizState.question.options.map((opt,i) => {
                      const isSelected = chosenOpt===opt, isCorrect = opt===livestockQuizState.question.answer;
                      const cls = answered?(isCorrect?"correct":isSelected?"wrong":""):"";
                      const labels=["A","B","C","D"];
                      return (
                        <button key={i} disabled={answered} onClick={()=>handleAnswer(opt)} className={`quiz-option-ancient ${cls}`} style={{borderColor:cls?undefined:"rgba(249,115,22,0.2)"}}>
                          <div style={{width:"28px",height:"28px",borderRadius:"8px",flexShrink:0,background:cls==="correct"?"rgba(255,255,255,0.2)":cls==="wrong"?"rgba(255,255,255,0.2)":"rgba(249,115,22,0.1)",border:"1px solid rgba(249,115,22,0.3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"13px",fontWeight:"900",color:"#fb923c"}}>{labels[i]}</div>
                          <span>{opt}</span>
                          {answered&&isCorrect&&<span style={{marginLeft:"auto"}}>✅</span>}
                          {answered&&isSelected&&!isCorrect&&<span style={{marginLeft:"auto"}}>❌</span>}
                        </button>
                      );
                    })}
                  </div>
                  {answered && (() => {
                    const isRight = chosenOpt === livestockQuizState.question.answer;
                    return (
                      <div style={{marginTop:"14px",width:"100%",maxWidth:"460px",display:"flex",flexDirection:"column",gap:"10px"}}>
                        <div style={{padding:"12px 18px",borderRadius:"16px",background:isRight?"rgba(34,197,94,0.12)":"rgba(239,68,68,0.12)",border:`1px solid ${isRight?"rgba(34,197,94,0.3)":"rgba(239,68,68,0.3)"}`}}>
                          {isRight
                            ? <div style={{color:"#4ade80",fontWeight:"900"}}>✅ Đúng! {ltype?.adultEmoji} {ltype?.name} sẽ được thu hoạch!</div>
                            : <div><div style={{color:"#f87171",fontWeight:"900"}}>❌ Sai! {ltype?.name} đã bỏ trốn...</div><div style={{color:"rgba(255,255,255,0.5)",fontSize:"11px",marginTop:"2px"}}>Đáp án: <strong style={{color:"#ffd700"}}>{livestockQuizState.question.answer}</strong></div></div>
                          }
                        </div>
                        <button
                          onClick={() => {
                            // completeLivestockHarvest đã được gọi qua setTimeout trong handleAnswer
                            // Nút này chỉ cần reset UI và chuyển tab
                            setLivestockQuizState(null);
                            setQuizMode(null);
                            setAnswered(false);
                            setChosenOpt(null);
                            setActivePanel("livestock");
                          }}
                          style={{
                            padding:"13px",borderRadius:"14px",border:"none",
                            background:isRight?"linear-gradient(135deg,#22c55e,#16a34a)":"rgba(255,255,255,0.1)",
                            color:"white",fontWeight:"900",fontSize:"15px",cursor:"pointer",fontFamily:"inherit",
                            boxShadow:isRight?"0 4px 16px rgba(34,197,94,0.4)":"none",
                          }}
                        >
                          {isRight ? "🐾 Tiếp tục →" : "↩ Quay lại"}
                        </button>
                      </div>
                    );
                  })()}
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

            <div style={{ background: "rgba(255,255,255,0.9)", borderRadius: "16px", padding: "16px", textAlign: "center", marginBottom: "14px" }}>
              <div style={{ fontSize: "20px", marginBottom: "6px" }}>🌱 Hạt Giống</div>
              <div style={{ fontSize: "14px", fontWeight: "800", marginBottom: "4px" }}>Bạn có: <span style={{ color: "#16a34a" }}>{seeds} hạt</span></div>
              <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "12px" }}>Trả lời đúng để nhận thêm hạt — hoặc đổi hạt lấy xu!</div>
              <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
                <button style={{ background: "linear-gradient(135deg,#16a34a,#22c55e)", color: "white", border: "none", borderRadius: "12px", padding: "10px 20px", fontWeight: "800", cursor: "pointer", fontSize: "13px" }} onClick={() => startQuiz(null)}>📝 Học từ nhận hạt</button>
                <button style={{ background: "linear-gradient(135deg,#f59e0b,#fbbf24)", color: "white", border: "none", borderRadius: "12px", padding: "10px 20px", fontWeight: "800", cursor: "pointer", fontSize: "13px" }} onClick={() => setShowSeedTradeModal(true)}>🌱→🪙 Đổi hạt lấy xu</button>
              </div>
            </div>

            {/* ===== CHỢ NÔNG SẢN ===== */}
            <div style={{ background: "rgba(255,255,255,0.9)", borderRadius: "18px", padding: "18px", marginBottom: "14px" }}>
              <div style={{ fontSize: "20px", textAlign: "center", marginBottom: "6px" }}>🏪 Chợ Nông Sản</div>

              {/* Banner cây gem hôm nay */}
              {dailyGemCrop && (() => {
                const gc = CROP_TYPES.find(c => c.id === dailyGemCrop);
                if (!gc) return null;
                return (
                  <div style={{
                    display: "flex", alignItems: "center", gap: "10px",
                    background: "linear-gradient(135deg,#fef3c7,#fde68a)",
                    border: "1.5px solid #f59e0b", borderRadius: "12px",
                    padding: "8px 14px", marginBottom: "12px",
                  }}>
                    <span style={{ fontSize: "24px" }}>{gc.emoji}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: "800", fontSize: "12px", color: "#92400e" }}>
                        ⭐ Cây đặc biệt — {String(farmDay).padStart(2,"0")}/{String(farmMonth).padStart(2,"0")}/{farmYear}
                      </div>
                      <div style={{ fontSize: "11px", color: "#b45309", fontWeight: "700" }}>
                        {gc.name} → nông sản bán được 💎 thay vì 🪙 hôm nay!
                      </div>
                    </div>
                    <span style={{ fontSize: "22px" }}>💎</span>
                  </div>
                );
              })()}

              <div style={{ fontSize: "10px", color: "#9ca3af", textAlign: "center", marginBottom: "12px" }}>
                Cây gem đổi mỗi ngày (5 phút thực) • Giữ nông sản để bán đúng ngày cây đặc biệt!
              </div>

              {(() => {
                const produceItems = CROP_TYPES.map(c => c.produce).filter(Boolean);
                const hasAny = produceItems.some(p => (produceInventory[p.id] || 0) > 0);
                if (!hasAny) {
                  return <p style={{ textAlign: "center", color: "#aaa", fontSize: "12px" }}>🌾 Kho nông sản trống. Hãy thu hoạch cây để có hàng bán!</p>;
                }
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {produceItems.map(p => {
                      const qty = produceInventory[p.id] || 0;
                      if (qty === 0) return null;
                      const price = getProduceSellPrice(p.id, dailyGemCrop);
                      const isGemDay = price.gems > 0;
                      return (
                        <div key={p.id} style={{
                          display: "flex", alignItems: "center", gap: "12px",
                          background: isGemDay
                            ? "linear-gradient(135deg,#fefce8,#fef9c3)"
                            : "linear-gradient(135deg,#f0fdf4,#dcfce7)",
                          borderRadius: "14px", padding: "10px 14px",
                          border: isGemDay ? "1.5px solid #eab308" : "1px solid #bbf7d0",
                          boxShadow: isGemDay ? "0 0 10px rgba(234,179,8,0.25)" : "none",
                        }}>
                          <div style={{ fontSize: "26px", position: "relative" }}>
                            {p.emoji}
                            {isGemDay && (
                              <span style={{ position: "absolute", top: -6, right: -8, fontSize: "13px" }}>💎</span>
                            )}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: "800", fontSize: "13px", display: "flex", alignItems: "center", gap: "5px" }}>
                              {p.name}
                              {isGemDay && (
                                <span style={{ fontSize: "9px", background: "#fef08a", color: "#92400e", borderRadius: "20px", padding: "1px 7px", fontWeight: "800" }}>
                                  💎 HÔM NAY
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: "11px", color: isGemDay ? "#b45309" : "#16a34a", fontWeight: "700" }}>
                              Kho: {qty} cái
                            </div>
                            <div style={{ fontSize: "10px", color: "#6b7280" }}>
                              Giá: {isGemDay ? `${price.gems}💎` : `${price.coins}🪙`} / cái
                            </div>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: "5px", alignItems: "flex-end" }}>
                            <button
                              onClick={() => {
                                if ((produceInventory[p.id] || 0) <= 0) return;
                                setProduceInventory(prev => ({ ...prev, [p.id]: (prev[p.id] || 0) - 1 }));
                                if (isGemDay) {
                                  setGems(prev => prev + price.gems);
                                  notify(`💎 Bán 1 ${p.emoji} ${p.name}: +${price.gems}💎`, "#eab308");
                                } else {
                                  setCoins(prev => prev + price.coins);
                                  notify(`🪙 Bán 1 ${p.emoji} ${p.name}: +${price.coins}🪙`, "#22c55e");
                                }
                              }}
                              style={{
                                background: isGemDay
                                  ? "linear-gradient(135deg,#eab308,#ca8a04)"
                                  : "linear-gradient(135deg,#16a34a,#22c55e)",
                                color: "white", border: "none", borderRadius: "10px",
                                padding: "5px 12px", fontWeight: "800", cursor: "pointer", fontSize: "11px",
                              }}
                            >Bán 1</button>
                            <button
                              onClick={() => {
                                const sellQty = produceInventory[p.id] || 0;
                                if (sellQty <= 0) return;
                                setProduceInventory(prev => ({ ...prev, [p.id]: 0 }));
                                if (isGemDay) {
                                  setGems(prev => prev + price.gems * sellQty);
                                  notify(`💎 Bán hết ${sellQty} ${p.emoji}: +${price.gems * sellQty}💎`, "#eab308");
                                } else {
                                  setCoins(prev => prev + price.coins * sellQty);
                                  notify(`🪙 Bán hết ${sellQty} ${p.emoji}: +${price.coins * sellQty}🪙`, "#f59e0b");
                                }
                              }}
                              style={{
                                background: isGemDay
                                  ? "linear-gradient(135deg,#f59e0b,#d97706)"
                                  : "linear-gradient(135deg,#f59e0b,#d97706)",
                                color: "white", border: "none", borderRadius: "10px",
                                padding: "5px 12px", fontWeight: "800", cursor: "pointer", fontSize: "11px",
                              }}
                            >Bán hết</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* ===== KHO NÔNG SẢN mini (tóm tắt) ===== */}
            {(() => {
              const produceItems = CROP_TYPES.map(c => c.produce).filter(Boolean);
              const hasAny = produceItems.some(p => (produceInventory[p.id] || 0) > 0);
              if (!hasAny) return null;
              return (
                <div style={{ background: "rgba(255,255,255,0.75)", borderRadius: "14px", padding: "10px 14px", marginBottom: "10px", display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
                  <span style={{ fontSize: "12px", fontWeight: "800", color: "#374151" }}>📦 Kho nông sản:</span>
                  {produceItems.map(p => {
                    const qty = produceInventory[p.id] || 0;
                    if (qty === 0) return null;
                    return (
                      <span key={p.id} style={{ fontSize: "12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "20px", padding: "2px 8px", fontWeight: "700", color: "#166534" }}>
                        {p.emoji} ×{qty}
                      </span>
                    );
                  })}
                </div>
              );
            })()}
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

        {/* ===== TAB VẬT NUÔI ===== */}
        {activePanel === "livestock" && (() => {
          // Phân khu: mỗi loại vật nuôi = 1 khu riêng
          const ZONE_CONFIG = {
            chicken: { zoneName:"🐔 Khu Gia Cầm", bg:"linear-gradient(160deg,#fef9c3 0%,#fef3c7 60%,#fde68a 100%)", border:"#f59e0b", floor:"#d97706" },
            rabbit:  { zoneName:"🐰 Khu Thỏ",     bg:"linear-gradient(160deg,#fce7f3 0%,#fdf2f8 60%,#f9a8d4 100%)", border:"#ec4899", floor:"#db2777" },
            pig:     { zoneName:"🐷 Khu Heo",      bg:"linear-gradient(160deg,#fff7ed 0%,#ffedd5 60%,#fed7aa 100%)", border:"#f97316", floor:"#ea580c" },
            cow:     { zoneName:"🐄 Khu Bò",       bg:"linear-gradient(160deg,#f0fdf4 0%,#dcfce7 60%,#bbf7d0 100%)", border:"#22c55e", floor:"#16a34a" },
            fox:     { zoneName:"🦊 Khu Cáo",      bg:"linear-gradient(160deg,#fff7ed 0%,#fef3c7 60%,#fed7aa 100%)", border:"#ea580c", floor:"#c2410c" },
          };

          // Hàm vẽ con vật 3D bằng SVG CSS
          const AnimalArt3D = ({ type, isAdult, size = 100 }) => {
            const s = size;
            // Mỗi loài có dáng hình riêng được dựng bằng SVG shapes
            const arts = {
              chicken: (
                <svg width={s} height={s} viewBox="0 0 100 100" style={{filter:"drop-shadow(0 8px 12px rgba(0,0,0,0.25))"}}>
                  {/* Shadow */}
                  <ellipse cx="50" cy="92" rx="28" ry="6" fill="rgba(0,0,0,0.18)"/>
                  {/* Body */}
                  <ellipse cx="50" cy="65" rx="26" ry="22" fill={isAdult?"#f59e0b":"#fbbf24"}/>
                  <ellipse cx="50" cy="65" rx="20" ry="17" fill={isAdult?"#d97706":"#f59e0b"} opacity="0.5"/>
                  {/* Wing */}
                  <ellipse cx="34" cy="67" rx="10" ry="14" fill={isAdult?"#92400e":"#f59e0b"} transform="rotate(-15 34 67)"/>
                  <ellipse cx="66" cy="67" rx="10" ry="14" fill={isAdult?"#92400e":"#f59e0b"} transform="rotate(15 66 67)"/>
                  {/* Neck */}
                  <ellipse cx="50" cy="46" rx="10" ry="12" fill={isAdult?"#f59e0b":"#fbbf24"}/>
                  {/* Head */}
                  <circle cx="50" cy="34" r="14" fill={isAdult?"#f59e0b":"#fbbf24"}/>
                  <circle cx="50" cy="34" r="10" fill={isAdult?"#d97706":"#f59e0b"} opacity="0.3"/>
                  {/* Comb */}
                  <path d="M46 22 Q48 14 50 20 Q52 12 54 20 Q56 15 57 22" fill="#ef4444" stroke="#dc2626" strokeWidth="0.5"/>
                  {/* Beak */}
                  <path d="M55 34 L62 37 L55 40 Z" fill="#f97316"/>
                  {/* Eye */}
                  <circle cx="46" cy="31" r="3" fill="white"/>
                  <circle cx="47" cy="31" r="1.5" fill="#1c1917"/>
                  <circle cx="47.5" cy="30.5" r="0.5" fill="white"/>
                  {/* Wattle */}
                  <ellipse cx="56" cy="40" rx="3" ry="5" fill="#ef4444"/>
                  {/* Legs */}
                  <line x1="44" y1="85" x2="38" y2="95" stroke="#d97706" strokeWidth="3" strokeLinecap="round"/>
                  <line x1="56" y1="85" x2="62" y2="95" stroke="#d97706" strokeWidth="3" strokeLinecap="round"/>
                  <line x1="38" y1="95" x2="30" y2="96" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round"/>
                  <line x1="62" y1="95" x2="70" y2="96" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round"/>
                  {isAdult && <text x="50" y="9" textAnchor="middle" fontSize="9" fill="#f59e0b" fontWeight="900">★ TRƯỞNG THÀNH</text>}
                </svg>
              ),
              rabbit: (
                <svg width={s} height={s} viewBox="0 0 100 100" style={{filter:"drop-shadow(0 8px 12px rgba(0,0,0,0.22))"}}>
                  <ellipse cx="50" cy="92" rx="26" ry="5" fill="rgba(0,0,0,0.15)"/>
                  {/* Ears */}
                  <ellipse cx="38" cy="22" rx="7" ry="20" fill={isAdult?"#f9a8d4":"#fce7f3"} transform="rotate(-10 38 22)"/>
                  <ellipse cx="62" cy="22" rx="7" ry="20" fill={isAdult?"#f9a8d4":"#fce7f3"} transform="rotate(10 62 22)"/>
                  <ellipse cx="38" cy="22" rx="3.5" ry="15" fill="#fda4af" transform="rotate(-10 38 22)"/>
                  <ellipse cx="62" cy="22" rx="3.5" ry="15" fill="#fda4af" transform="rotate(10 62 22)"/>
                  {/* Body */}
                  <ellipse cx="50" cy="68" rx="24" ry="22" fill={isAdult?"#f9a8d4":"#fce7f3"}/>
                  <ellipse cx="50" cy="68" rx="16" ry="14" fill={isAdult?"#fbcfe8":"white"} opacity="0.6"/>
                  {/* Head */}
                  <circle cx="50" cy="44" r="16" fill={isAdult?"#f9a8d4":"#fce7f3"}/>
                  <ellipse cx="50" cy="52" rx="7" ry="5" fill={isAdult?"#fbcfe8":"white"}/>
                  {/* Nose */}
                  <ellipse cx="50" cy="50" rx="2.5" ry="2" fill="#f43f5e"/>
                  {/* Eyes */}
                  <circle cx="43" cy="42" r="3.5" fill={isAdult?"#ec4899":"#be185d"}/>
                  <circle cx="57" cy="42" r="3.5" fill={isAdult?"#ec4899":"#be185d"}/>
                  <circle cx="44" cy="41" r="1" fill="white"/>
                  <circle cx="58" cy="41" r="1" fill="white"/>
                  {/* Whiskers */}
                  <line x1="52" y1="50" x2="66" y2="47" stroke="rgba(0,0,0,0.2)" strokeWidth="0.8"/>
                  <line x1="52" y1="51" x2="66" y2="52" stroke="rgba(0,0,0,0.2)" strokeWidth="0.8"/>
                  <line x1="48" y1="50" x2="34" y2="47" stroke="rgba(0,0,0,0.2)" strokeWidth="0.8"/>
                  <line x1="48" y1="51" x2="34" y2="52" stroke="rgba(0,0,0,0.2)" strokeWidth="0.8"/>
                  {/* Tail */}
                  <circle cx="72" cy="72" r="7" fill="white"/>
                  {/* Feet */}
                  <ellipse cx="39" cy="89" rx="12" ry="6" fill={isAdult?"#f9a8d4":"#fce7f3"} transform="rotate(-10 39 89)"/>
                  <ellipse cx="61" cy="89" rx="12" ry="6" fill={isAdult?"#f9a8d4":"#fce7f3"} transform="rotate(10 61 89)"/>
                  {isAdult && <text x="50" y="9" textAnchor="middle" fontSize="9" fill="#ec4899" fontWeight="900">★ TRƯỞNG THÀNH</text>}
                </svg>
              ),
              pig: (
                <svg width={s} height={s} viewBox="0 0 100 100" style={{filter:"drop-shadow(0 8px 14px rgba(0,0,0,0.25))"}}>
                  <ellipse cx="50" cy="93" rx="30" ry="6" fill="rgba(0,0,0,0.18)"/>
                  {/* Body */}
                  <ellipse cx="50" cy="67" rx="30" ry="24" fill={isAdult?"#f97316":"#fdba74"}/>
                  <ellipse cx="50" cy="64" rx="22" ry="16" fill={isAdult?"#ea580c":"#fb923c"} opacity="0.35"/>
                  {/* Ears */}
                  <ellipse cx="34" cy="34" rx="10" ry="8" fill={isAdult?"#f97316":"#fdba74"} transform="rotate(-25 34 34)"/>
                  <ellipse cx="66" cy="34" rx="10" ry="8" fill={isAdult?"#f97316":"#fdba74"} transform="rotate(25 66 34)"/>
                  <ellipse cx="34" cy="34" rx="5" ry="4" fill="#fda4af" transform="rotate(-25 34 34)"/>
                  <ellipse cx="66" cy="34" rx="5" ry="4" fill="#fda4af" transform="rotate(25 66 34)"/>
                  {/* Head */}
                  <circle cx="50" cy="42" r="20" fill={isAdult?"#f97316":"#fdba74"}/>
                  {/* Snout */}
                  <ellipse cx="50" cy="52" rx="11" ry="8" fill={isAdult?"#ea580c":"#fb923c"}/>
                  <circle cx="47" cy="52" r="2.5" fill="#7c2d12" opacity="0.6"/>
                  <circle cx="53" cy="52" r="2.5" fill="#7c2d12" opacity="0.6"/>
                  {/* Eyes */}
                  <circle cx="41" cy="38" r="4" fill="white"/>
                  <circle cx="59" cy="38" r="4" fill="white"/>
                  <circle cx="42" cy="38" r="2" fill="#1c1917"/>
                  <circle cx="60" cy="38" r="2" fill="#1c1917"/>
                  <circle cx="42.7" cy="37.3" r="0.8" fill="white"/>
                  <circle cx="60.7" cy="37.3" r="0.8" fill="white"/>
                  {/* Curl tail */}
                  <path d="M78 67 Q90 58 85 68 Q80 78 86 72" fill="none" stroke={isAdult?"#f97316":"#fdba74"} strokeWidth="4" strokeLinecap="round"/>
                  {/* Legs */}
                  <rect x="32" y="85" width="10" height="12" rx="5" fill={isAdult?"#f97316":"#fdba74"}/>
                  <rect x="46" y="87" width="10" height="11" rx="5" fill={isAdult?"#f97316":"#fdba74"}/>
                  <rect x="58" y="85" width="10" height="12" rx="5" fill={isAdult?"#f97316":"#fdba74"}/>
                  {isAdult && <text x="50" y="9" textAnchor="middle" fontSize="9" fill="#ea580c" fontWeight="900">★ TRƯỞNG THÀNH</text>}
                </svg>
              ),
              cow: (
                <svg width={s} height={s} viewBox="0 0 100 100" style={{filter:"drop-shadow(0 10px 16px rgba(0,0,0,0.28))"}}>
                  <ellipse cx="50" cy="94" rx="34" ry="5" fill="rgba(0,0,0,0.18)"/>
                  {/* Horns */}
                  <path d="M35 28 Q28 18 26 24 Q30 28 36 32" fill={isAdult?"#d97706":"#f59e0b"}/>
                  <path d="M65 28 Q72 18 74 24 Q70 28 64 32" fill={isAdult?"#d97706":"#f59e0b"}/>
                  {/* Body - spotted */}
                  <ellipse cx="50" cy="67" rx="32" ry="26" fill="white"/>
                  <ellipse cx="38" cy="58" rx="10" ry="8" fill={isAdult?"#78716c":"#a8a29e"} transform="rotate(-20 38 58)"/>
                  <ellipse cx="62" cy="72" rx="8" ry="11" fill={isAdult?"#78716c":"#a8a29e"}/>
                  <ellipse cx="44" cy="78" rx="7" ry="6" fill={isAdult?"#78716c":"#a8a29e"} transform="rotate(15 44 78)"/>
                  {/* Head */}
                  <ellipse cx="50" cy="38" rx="18" ry="16" fill="white"/>
                  <ellipse cx="38" cy="37" rx="6" ry="7" fill={isAdult?"#78716c":"#a8a29e"}/>
                  {/* Snout */}
                  <ellipse cx="50" cy="48" rx="12" ry="8" fill="#fda4af"/>
                  <circle cx="46" cy="48" r="2.5" fill="#be185d" opacity="0.5"/>
                  <circle cx="54" cy="48" r="2.5" fill="#be185d" opacity="0.5"/>
                  {/* Ears */}
                  <ellipse cx="31" cy="32" rx="7" ry="5" fill="white" transform="rotate(-40 31 32)"/>
                  <ellipse cx="69" cy="32" rx="7" ry="5" fill="white" transform="rotate(40 69 32)"/>
                  <ellipse cx="31" cy="32" rx="4" ry="3" fill="#fda4af" transform="rotate(-40 31 32)"/>
                  <ellipse cx="69" cy="32" rx="4" ry="3" fill="#fda4af" transform="rotate(40 69 32)"/>
                  {/* Eyes */}
                  <circle cx="42" cy="34" r="4" fill="#1c1917"/>
                  <circle cx="58" cy="34" r="4" fill="#1c1917"/>
                  <circle cx="43" cy="33" r="1.5" fill="white"/>
                  <circle cx="59" cy="33" r="1.5" fill="white"/>
                  {/* Udder */}
                  <ellipse cx="50" cy="91" rx="14" ry="8" fill="#fda4af"/>
                  {/* Legs */}
                  <rect x="28" y="85" width="9" height="13" rx="4" fill={isAdult?"#78716c":"#a8a29e"}/>
                  <rect x="40" y="87" width="9" height="12" rx="4" fill="white" stroke={isAdult?"#78716c":"#d1d5db"} strokeWidth="1"/>
                  <rect x="51" y="87" width="9" height="12" rx="4" fill="white" stroke={isAdult?"#78716c":"#d1d5db"} strokeWidth="1"/>
                  <rect x="63" y="85" width="9" height="13" rx="4" fill={isAdult?"#78716c":"#a8a29e"}/>
                  {isAdult && <text x="50" y="9" textAnchor="middle" fontSize="9" fill="#16a34a" fontWeight="900">★ TRƯỞNG THÀNH</text>}
                </svg>
              ),
              fox: (
                <svg width={s} height={s} viewBox="0 0 100 100" style={{filter:"drop-shadow(0 8px 14px rgba(0,0,0,0.28))"}}>
                  <ellipse cx="50" cy="93" rx="26" ry="5" fill="rgba(0,0,0,0.18)"/>
                  {/* Tail */}
                  <path d="M72 75 Q95 65 90 80 Q85 95 70 85 Q78 80 72 75" fill={isAdult?"#ea580c":"#f97316"}/>
                  <ellipse cx="85" cy="82" rx="8" ry="6" fill="white" transform="rotate(-20 85 82)"/>
                  {/* Body */}
                  <ellipse cx="48" cy="68" rx="26" ry="21" fill={isAdult?"#ea580c":"#f97316"}/>
                  <ellipse cx="48" cy="72" rx="14" ry="12" fill="white" opacity="0.7"/>
                  {/* Ears pointed */}
                  <path d="M33 32 L27 14 L42 28 Z" fill={isAdult?"#ea580c":"#f97316"}/>
                  <path d="M67 32 L73 14 L58 28 Z" fill={isAdult?"#ea580c":"#f97316"}/>
                  <path d="M34 32 L29 18 L41 29 Z" fill="#fda4af"/>
                  <path d="M66 32 L71 18 L59 29 Z" fill="#fda4af"/>
                  {/* Head */}
                  <circle cx="50" cy="40" r="18" fill={isAdult?"#ea580c":"#f97316"}/>
                  {/* Face white */}
                  <ellipse cx="50" cy="44" rx="11" ry="9" fill="white"/>
                  <ellipse cx="38" cy="42" rx="7" ry="8" fill="white" opacity="0.8"/>
                  <ellipse cx="62" cy="42" rx="7" ry="8" fill="white" opacity="0.8"/>
                  {/* Nose */}
                  <ellipse cx="50" cy="48" rx="4" ry="2.5" fill="#1c1917"/>
                  {/* Eyes - slit pupils */}
                  <circle cx="42" cy="37" r="4.5" fill="#d97706"/>
                  <circle cx="58" cy="37" r="4.5" fill="#d97706"/>
                  <ellipse cx="42" cy="37" rx="1.5" ry="3" fill="#1c1917"/>
                  <ellipse cx="58" cy="37" rx="1.5" ry="3" fill="#1c1917"/>
                  <circle cx="43" cy="36" r="0.7" fill="white"/>
                  <circle cx="59" cy="36" r="0.7" fill="white"/>
                  {/* Whiskers */}
                  <line x1="54" y1="48" x2="70" y2="44" stroke="white" strokeWidth="1" opacity="0.8"/>
                  <line x1="54" y1="50" x2="70" y2="52" stroke="white" strokeWidth="1" opacity="0.8"/>
                  <line x1="46" y1="48" x2="30" y2="44" stroke="white" strokeWidth="1" opacity="0.8"/>
                  <line x1="46" y1="50" x2="30" y2="52" stroke="white" strokeWidth="1" opacity="0.8"/>
                  {/* Legs */}
                  <rect x="32" y="84" width="9" height="12" rx="4" fill={isAdult?"#ea580c":"#f97316"}/>
                  <rect x="44" y="86" width="9" height="11" rx="4" fill={isAdult?"#ea580c":"#f97316"}/>
                  <rect x="56" y="86" width="9" height="11" rx="4" fill={isAdult?"#ea580c":"#f97316"}/>
                  {isAdult && <text x="50" y="9" textAnchor="middle" fontSize="9" fill="#ea580c" fontWeight="900">★ TRƯỞNG THÀNH</text>}
                </svg>
              ),
            };
            return arts[type] || <span style={{fontSize:"60px"}}>{isAdult?"🐄":"🐮"}</span>;
          };

          const zones = LIVESTOCK_TYPES.map(ltype => {
            const animalsInZone = livestock.filter(a => a.type === ltype.id);
            const zc = ZONE_CONFIG[ltype.id];
            return { ltype, animalsInZone, zc };
          });

          return (
            <div style={{padding:"10px 8px", minHeight:"100%"}}>
              {/* Header */}
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"10px",flexWrap:"wrap",gap:"8px"}}>
                <div style={{fontSize:"18px",fontWeight:"900",color:"#ea580c",display:"flex",alignItems:"center",gap:"6px"}}>🐾 Trang Trại Vật Nuôi</div>
                {/* Kho nông sản nhỏ gọn */}
                <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
                  {CROP_TYPES.filter(c=>c.produce).map(c => {
                    const qty = produceInventory[c.produce.id]||0;
                    return qty > 0 ? (
                      <div key={c.produce.id} style={{background:"#dcfce7",borderRadius:"20px",padding:"3px 10px",fontSize:"11px",fontWeight:"700",color:"#166534",border:"1px solid #86efac"}}>
                        {c.produce.emoji}{qty}
                      </div>
                    ) : null;
                  })}
                </div>
              </div>

              {/* Lưu ý */}
              <div style={{fontSize:"11px",color:"#78716c",marginBottom:"12px",background:"rgba(249,115,22,0.07)",borderRadius:"10px",padding:"7px 12px",border:"1px solid rgba(249,115,22,0.2)"}}>
                🌾 Thu hoạch nông sản → cho vật nuôi ăn → lớn thành → làm quiz để nhận thưởng & từ vào Ô xanh!
              </div>

              {/* CÁC KHU PHÂN VÙNG */}
              <div style={{display:"flex",flexDirection:"column",gap:"14px"}}>
                {zones.map(({ltype, animalsInZone, zc}) => {
                  const isFull = animalsInZone.length >= ltype.maxCount;
                  const hasFood = ltype.food.some(fid=>(produceInventory[fid]||0)>0);
                  return (
                    <div key={ltype.id} style={{
                      background: zc.bg,
                      border: `2px solid ${zc.border}`,
                      borderRadius:"20px",
                      overflow:"hidden",
                      boxShadow:`0 4px 18px ${zc.border}28`,
                    }}>
                      {/* Zone header */}
                      <div style={{
                        background:`${zc.border}22`,
                        borderBottom:`1.5px solid ${zc.border}50`,
                        padding:"8px 14px",
                        display:"flex",alignItems:"center",justifyContent:"space-between",
                      }}>
                        <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                          <span style={{fontSize:"16px",fontWeight:"900",color:zc.floor}}>{zc.zoneName}</span>
                          <span style={{fontSize:"10px",background:zc.border,color:"white",borderRadius:"20px",padding:"2px 8px",fontWeight:"700"}}>
                            {animalsInZone.length}/{ltype.maxCount} con
                          </span>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
                          <span style={{fontSize:"10px",color:zc.floor,fontWeight:"600"}}>{ltype.foodEmoji} {ltype.foodName}</span>
                          {!isFull && availableWords.length > 0 && (
                            <button onClick={()=>addLivestock(ltype.id)} style={{
                              background:zc.border,color:"white",border:"none",borderRadius:"12px",
                              padding:"5px 12px",fontSize:"11px",fontWeight:"800",cursor:"pointer",fontFamily:"inherit",
                            }}>+ Thêm</button>
                          )}
                        </div>
                      </div>

                      {/* Zone floor / animals */}
                      <div style={{padding:"12px 14px",minHeight:"90px",position:"relative"}}>
                        {/* Decorative floor lines */}
                        <div style={{position:"absolute",bottom:0,left:0,right:0,height:"18px",background:`${zc.floor}18`,borderTop:`1.5px dashed ${zc.border}40`}}/>

                        {animalsInZone.length === 0 ? (
                          <div style={{textAlign:"center",padding:"16px 0",color:zc.floor,opacity:0.55}}>
                            <div style={{fontSize:"28px",marginBottom:"4px"}}>🌿</div>
                            <div style={{fontSize:"11px",fontWeight:"700"}}>Chuồng trống — bấm "+ Thêm" để nuôi!</div>
                          </div>
                        ) : (
                          <div style={{display:"flex",gap:"12px",flexWrap:"wrap",alignItems:"flex-end",paddingBottom:"12px"}}>
                            {animalsInZone.map(animal => {
                              const progress = Math.min(100, (animal.feedCount/ltype.feedsNeeded)*100);
                              const availFood = ltype.food.filter(fid=>(produceInventory[fid]||0)>0);
                              return (
                                <div key={animal.id} style={{
                                  display:"flex",flexDirection:"column",alignItems:"center",
                                  background:"rgba(255,255,255,0.72)",
                                  borderRadius:"18px",padding:"10px 14px",
                                  border:`2px solid ${animal.isAdult?zc.border:"transparent"}`,
                                  boxShadow: animal.isAdult?`0 0 16px ${zc.border}55`:"0 2px 8px rgba(0,0,0,0.08)",
                                  position:"relative",minWidth:"130px",
                                  animation: animal.isAdult ? "bounce 1.8s ease-in-out infinite" : "none",
                                }}>
                                  {/* Từ ô vàng tag */}
                                  <div style={{
                                    position:"absolute",top:"-10px",left:"50%",transform:"translateX(-50%)",
                                    background:"#fef3c7",border:"1.5px solid #f59e0b",borderRadius:"20px",
                                    padding:"2px 10px",fontSize:"9px",fontWeight:"900",color:"#78350f",
                                    whiteSpace:"nowrap",boxShadow:"0 2px 6px rgba(245,158,11,0.3)",
                                  }}>📖 {animal.word}</div>

                                  {/* 3D Animal Art */}
                                  <div style={{marginTop:"6px"}}>
                                    <AnimalArt3D type={ltype.id} isAdult={animal.isAdult} size={88}/>
                                  </div>

                                  {/* Progress or adult badge */}
                                  {!animal.isAdult ? (
                                    <div style={{width:"100%",marginTop:"6px"}}>
                                      <div style={{fontSize:"9px",color:"#6b7280",textAlign:"center",marginBottom:"3px"}}>
                                        🍽️ {animal.feedCount}/{ltype.feedsNeeded} lần
                                      </div>
                                      <div style={{height:"5px",background:"#e5e7eb",borderRadius:"5px",overflow:"hidden"}}>
                                        <div style={{width:`${progress}%`,height:"100%",background:`linear-gradient(90deg,${zc.border},${zc.floor})`,borderRadius:"5px",transition:"width 0.4s"}}/>
                                      </div>
                                    </div>
                                  ) : (
                                    <div style={{fontSize:"9px",color:zc.floor,fontWeight:"900",marginTop:"4px",textAlign:"center"}}>✨ Sẵn sàng thu!</div>
                                  )}

                                  {/* Action buttons */}
                                  <div style={{display:"flex",gap:"6px",marginTop:"8px"}}>
                                    {animal.isAdult ? (
                                      <button onClick={()=>harvestAnimal(animal.id)} style={{
                                        background:`linear-gradient(135deg,${zc.border},${zc.floor})`,
                                        color:"white",border:"none",borderRadius:"10px",
                                        padding:"6px 12px",fontWeight:"900",fontSize:"11px",
                                        cursor:"pointer",fontFamily:"inherit",
                                        boxShadow:`0 3px 10px ${zc.border}55`,
                                      }}>🎯 Thu hoạch</button>
                                    ) : (
                                      <button onClick={()=>feedAnimalAuto(animal.id)}
                                        disabled={availFood.length===0}
                                        style={{
                                          background:availFood.length>0?`linear-gradient(135deg,#22c55e,#16a34a)`:"#e5e7eb",
                                          color:availFood.length>0?"white":"#9ca3af",
                                          border:"none",borderRadius:"10px",
                                          padding:"6px 12px",fontWeight:"800",fontSize:"11px",
                                          cursor:availFood.length>0?"pointer":"not-allowed",fontFamily:"inherit",
                                        }}>🍽️ Cho ăn</button>
                                    )}
                                    <button onClick={()=>{
                                      if(window.confirm(`Thả ${ltype.emoji} "${animal.word}"?`))
                                        setLivestock(prev=>prev.filter(a=>a.id!==animal.id));
                                    }} style={{background:"transparent",border:"1px solid #fca5a5",borderRadius:"10px",padding:"6px 8px",fontSize:"10px",color:"#ef4444",cursor:"pointer",fontFamily:"inherit"}}>🚪</button>
                                  </div>
                                </div>
                              );
                            })}

                            {/* Ô trống thêm trong zone */}
                            {!isFull && Array.from({length: ltype.maxCount - animalsInZone.length}).map((_,i)=>(
                              <div key={`empty_${i}`} onClick={()=>addLivestock(ltype.id)} style={{
                                width:"130px",minHeight:"160px",
                                border:`2px dashed ${zc.border}60`,borderRadius:"18px",
                                display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                                gap:"8px",cursor:"pointer",opacity:0.55,
                                transition:"opacity 0.2s",
                              }}
                              onMouseEnter={e=>e.currentTarget.style.opacity="0.85"}
                              onMouseLeave={e=>e.currentTarget.style.opacity="0.55"}
                              >
                                <div style={{fontSize:"32px",color:zc.border}}>+</div>
                                <div style={{fontSize:"10px",color:zc.floor,fontWeight:"700",textAlign:"center",padding:"0 8px"}}>Thêm {ltype.name}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {availableWords.length === 0 && (
                <div style={{marginTop:"12px",padding:"10px 14px",background:"#fef2f2",borderRadius:"12px",border:"1px solid #fecaca",fontSize:"12px",color:"#dc2626",fontWeight:"700",textAlign:"center"}}>
                  ⚠️ Cần có từ trong Ô vàng để thêm vật nuôi!
                </div>
              )}
            </div>
          );
        })()}

        {/* ===== TAB NHIỆM VỤ ===== */}
        {activePanel === "quests" && (() => {
          // ===== HỆ THỐNG NHIỆM VỤ VÔ HẠN =====
          // Tự sinh ra các mốc theo cấp số: cứ hoàn thành mốc N thì xuất hiện mốc N+1
          const buildInfiniteQuests = () => {
            const quests = [];

            // --- Thu hoạch (cây) ---
            // Mốc: 1,10,50,100,250,500,1000,2500,5000,10000,...
            const harvestMilestones = [1,10,50,100,250,500,1000,2500,5000,10000];
            for (let i = 0; i < harvestMilestones.length; i++) {
              const m = harvestMilestones[i];
              // Chỉ hiển thị đến mốc tiếp theo của mốc hiện tại đã vượt
              if (score < harvestMilestones[i-1] && i > 0) break;
              const gem = i === 0 ? 5 : Math.round(5 * Math.pow(1.8, i));
              quests.push({
                id: `harvest_${m}`,
                name: m === 1 ? "Mùa màng đầu tiên" : m <= 50 ? "Nông dân chăm chỉ" : m <= 500 ? "Chủ trang trại" : m <= 5000 ? "Nông trại huyền thoại" : "Nông thần",
                icon: m === 1 ? "🌾" : m <= 10 ? "🌽" : m <= 100 ? "🚜" : m <= 1000 ? "🏆" : "👑",
                desc: `Thu hoạch ${m.toLocaleString()} cây`,
                cur: score, max: m,
                gem,
                category: "harvest",
              });
              if (score < m) break; // chỉ hiện mốc kế tiếp chưa xong
            }
            // Mốc tiếp theo ngoài bảng
            const lastHarvest = harvestMilestones[harvestMilestones.length - 1];
            if (score >= lastHarvest) {
              let next = lastHarvest * 2;
              while (score >= next) next *= 2;
              const gem = Math.round(5 * Math.pow(1.8, harvestMilestones.length) * Math.log2(next / lastHarvest));
              quests.push({ id: `harvest_${next}`, name: "Nông thần vô hạn", icon: "🌟", desc: `Thu hoạch ${next.toLocaleString()} cây`, cur: score, max: next, gem, category: "harvest" });
            }

            // --- Streak ---
            const streakMilestones = [5,10,20,30,50,75,100,150,200,300,500];
            for (let i = 0; i < streakMilestones.length; i++) {
              const m = streakMilestones[i];
              if (streak < (streakMilestones[i-1] || 0) && i > 0) break;
              const gem = Math.round(8 * Math.pow(1.6, i));
              quests.push({
                id: `streak_${m}`,
                name: m <= 5 ? "Bất bại" : m <= 20 ? "Thần đồng" : m <= 50 ? "Chiến thần" : m <= 100 ? "Huyền thoại" : "Bất tử",
                icon: m <= 5 ? "⚡" : m <= 20 ? "👑" : m <= 50 ? "🔥" : m <= 100 ? "💫" : "∞",
                desc: `Đạt Streak x${m}`,
                cur: streak, max: m,
                gem,
                category: "streak",
              });
              if (streak < m) break;
            }
            const lastStreak = streakMilestones[streakMilestones.length - 1];
            if (streak >= lastStreak) {
              let next = Math.ceil(lastStreak * 1.5 / 10) * 10;
              while (streak >= next) next = Math.ceil(next * 1.5 / 10) * 10;
              quests.push({ id: `streak_${next}`, name: "Streak vô cực", icon: "♾️", desc: `Đạt Streak x${next}`, cur: streak, max: next, gem: Math.round(8 * Math.pow(1.6, streakMilestones.length + Math.floor(Math.log(next/lastStreak)/Math.log(1.5)))), category: "streak" });
            }

            // --- Xu (coins) ---
            const coinMilestones = [100,500,1000,5000,10000,50000,100000,500000];
            for (let i = 0; i < coinMilestones.length; i++) {
              const m = coinMilestones[i];
              if (coins < (coinMilestones[i-1] || 0) && i > 0) break;
              const gem = Math.round(15 * Math.pow(2, i));
              quests.push({
                id: `coins_${m}`,
                name: m <= 100 ? "Triệu phú" : m <= 1000 ? "Đại gia" : m <= 10000 ? "Tỷ phú" : m <= 100000 ? "Vua tài chính" : "Chúa tể vàng",
                icon: m <= 100 ? "💰" : m <= 1000 ? "💎" : m <= 10000 ? "🏦" : "👑",
                desc: `Sở hữu ${m.toLocaleString()} xu`,
                cur: coins, max: m,
                gem,
                category: "coins",
              });
              if (coins < m) break;
            }
            const lastCoin = coinMilestones[coinMilestones.length - 1];
            if (coins >= lastCoin) {
              let next = lastCoin * 10;
              while (coins >= next) next *= 10;
              quests.push({ id: `coins_${next}`, name: "Chúa tể vàng", icon: "🌟", desc: `Sở hữu ${next.toLocaleString()} xu`, cur: coins, max: next, gem: Math.round(15 * Math.pow(2, coinMilestones.length) * Math.log10(next/lastCoin)), category: "coins" });
            }

            // --- Cấp độ ---
            const levelMilestones = [5,10,15,20,30,40,50,75,100];
            for (let i = 0; i < levelMilestones.length; i++) {
              const m = levelMilestones[i];
              if (level < (levelMilestones[i-1] || 0) && i > 0) break;
              const gem = Math.round(25 * Math.pow(1.7, i));
              quests.push({
                id: `level_${m}`,
                name: m <= 5 ? "Cao thủ" : m <= 10 ? "Bậc thầy" : m <= 20 ? "Đại sư" : m <= 50 ? "Huyền thoại" : "Thần nông",
                icon: m <= 5 ? "⭐" : m <= 10 ? "👑" : m <= 20 ? "🌟" : m <= 50 ? "💫" : "🐉",
                desc: `Đạt cấp độ ${m}`,
                cur: level, max: m,
                gem,
                category: "level",
              });
              if (level < m) break;
            }
            const lastLevel = levelMilestones[levelMilestones.length - 1];
            if (level >= lastLevel) {
              let next = Math.ceil(lastLevel * 1.5 / 5) * 5;
              while (level >= next) next = Math.ceil(next * 1.5 / 5) * 5;
              quests.push({ id: `level_${next}`, name: "Thần nông bất tử", icon: "♾️", desc: `Đạt cấp độ ${next}`, cur: level, max: next, gem: Math.round(25 * Math.pow(1.7, levelMilestones.length)), category: "level" });
            }

            // --- Diệt sâu ---
            const pestMilestones = [10,50,100,500,1000,5000,10000];
            for (let i = 0; i < pestMilestones.length; i++) {
              const m = pestMilestones[i];
              if (pestKilled < (pestMilestones[i-1] || 0) && i > 0) break;
              const gem = Math.round(10 * Math.pow(1.9, i));
              quests.push({
                id: `pest_${m}`,
                name: m <= 10 ? "Thợ săn sâu bọ" : m <= 100 ? "Sát thủ sâu bọ" : m <= 1000 ? "Đại đao thủ" : "Thần diệt sâu",
                icon: m <= 10 ? "🔫" : m <= 100 ? "⚔️" : m <= 1000 ? "🗡️" : "💀",
                desc: `Diệt ${m.toLocaleString()} con sâu`,
                cur: pestKilled, max: m,
                gem,
                category: "pest",
              });
              if (pestKilled < m) break;
            }

            // --- Từ vựng ---
            const wordMilestones = [20,50,100,250,500,1000,2500,5000];
            for (let i = 0; i < wordMilestones.length; i++) {
              const m = wordMilestones[i];
              if (wordsMastered < (wordMilestones[i-1] || 0) && i > 0) break;
              const gem = Math.round(20 * Math.pow(1.7, i));
              quests.push({
                id: `words_${m}`,
                name: m <= 20 ? "Từ vựng thông thái" : m <= 100 ? "Học giả" : m <= 500 ? "Giáo sư ngôn ngữ" : "Ngôn ngữ thần",
                icon: m <= 20 ? "📖" : m <= 100 ? "📚" : m <= 500 ? "🎓" : "🧠",
                desc: `Thu hoạch ${m.toLocaleString()} từ vựng`,
                cur: wordsMastered, max: m,
                gem,
                category: "words",
              });
              if (wordsMastered < m) break;
            }

            return quests;
          };

          const allQuests = buildInfiniteQuests();

          // Kiểm tra quest hoàn thành dựa theo id lưu trong achievements
          const isDone = (q) => achievements.includes(q.id);

          // Sắp xếp: chưa xong lên đầu (theo % tiến độ giảm dần), xong xuống dưới
          const pending = allQuests.filter(q => !isDone(q)).sort((a, b) => {
            const pctA = a.cur / a.max;
            const pctB = b.cur / b.max;
            return pctB - pctA; // gần xong nhất lên trước
          });
          const done = allQuests.filter(q => isDone(q));
          const sorted = [...pending, ...done];

          const earnedGems = done.reduce((s, q) => s + q.gem, 0);
          const completedCount = done.length;

          // Category labels
          const catLabel = { harvest: "🌾 Thu hoạch", streak: "⚡ Streak", coins: "🪙 Xu", level: "⭐ Cấp độ", pest: "🐛 Diệt sâu", words: "📖 Từ vựng" };

          return (
            <div style={{
              padding: "14px 12px",
              minHeight: "100%",
              background: "linear-gradient(160deg,#fdf6ec 0%,#fffbf0 60%,#fef9f0 100%)",
              borderRadius: "16px",
            }}>
              {/* Header tổng quan */}
              <div style={{
                background: "linear-gradient(135deg,#fff7ed,#fef3c7)",
                border: "1.5px solid #fcd34d",
                borderRadius: "18px",
                padding: "14px 16px",
                marginBottom: "16px",
                display: "flex",
                alignItems: "center",
                gap: "14px",
                boxShadow: "0 2px 12px rgba(251,191,36,0.15)",
              }}>
                <div style={{
                  width: "52px", height: "52px", borderRadius: "16px", flexShrink: 0,
                  background: "linear-gradient(135deg,#fbbf24,#f59e0b)",
                  boxShadow: "0 4px 12px rgba(251,191,36,0.4)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: "26px",
                }}>🏆</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "15px", fontWeight: "900", color: "#78350f", marginBottom: "1px" }}>
                    Nhiệm vụ · <span style={{ color: "#d97706" }}>{completedCount}</span> hoàn thành
                  </div>
                  <div style={{ fontSize: "11px", color: "#92400e", opacity: 0.7, marginBottom: "7px" }}>
                    {earnedGems.toLocaleString()} 💎 đã nhận · Nhiệm vụ tự tăng vô hạn!
                  </div>
                  <div style={{ height: "8px", background: "rgba(120,53,15,0.12)", borderRadius: "99px", overflow: "hidden" }}>
                    <div style={{
                      height: "100%",
                      width: `${allQuests.length ? (completedCount / allQuests.length) * 100 : 0}%`,
                      background: "linear-gradient(90deg,#f59e0b,#fbbf24,#fde68a)",
                      borderRadius: "99px",
                      transition: "width 0.5s ease",
                    }} />
                  </div>
                  <div style={{ fontSize: "10px", color: "#92400e", opacity: 0.5, marginTop: "3px" }}>
                    {completedCount}/{allQuests.length} nhiệm vụ hiện tại
                  </div>
                </div>
              </div>

              {/* Label phân loại — đang thực hiện */}
              {pending.length > 0 && (
                <div style={{ fontSize: "11px", fontWeight: "800", color: "#7c3aed", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "10px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ flex: 1, height: "1.5px", background: "linear-gradient(90deg,transparent,#c4b5fd)" }} />
                  ⏳ Đang thực hiện ({pending.length})
                  <div style={{ flex: 1, height: "1.5px", background: "linear-gradient(90deg,#c4b5fd,transparent)" }} />
                </div>
              )}

              {/* Danh sách nhiệm vụ */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {sorted.map((q, idx) => {
                  const qDone = isDone(q);
                  const pct = Math.min(100, Math.round((q.cur / q.max) * 100));
                  const isAlmost = !qDone && pct >= 60;

                  const showDoneLabel = qDone && (idx === 0 || !isDone(sorted[idx - 1]));

                  // Color scheme per state
                  const cardBg = qDone
                    ? "linear-gradient(135deg,#f0fdf4,#dcfce7)"
                    : isAlmost
                    ? "linear-gradient(135deg,#f5f3ff,#ede9fe)"
                    : "linear-gradient(135deg,#ffffff,#f9fafb)";
                  const cardBorder = qDone ? "1.5px solid #86efac" : isAlmost ? "1.5px solid #c4b5fd" : "1.5px solid #e5e7eb";
                  const cardShadow = qDone ? "0 2px 8px rgba(34,197,94,0.10)" : isAlmost ? "0 2px 8px rgba(139,92,246,0.10)" : "0 1px 4px rgba(0,0,0,0.05)";
                  const nameColor = qDone ? "#15803d" : isAlmost ? "#6d28d9" : "#1f2937";
                  const descColor = qDone ? "#166534" : isAlmost ? "#7c3aed" : "#6b7280";
                  const barBg = qDone ? "rgba(34,197,94,0.15)" : isAlmost ? "rgba(139,92,246,0.12)" : "#e5e7eb";
                  const barFill = qDone
                    ? "linear-gradient(90deg,#22c55e,#4ade80)"
                    : isAlmost
                    ? "linear-gradient(90deg,#7c3aed,#a78bfa)"
                    : "linear-gradient(90deg,#93c5fd,#60a5fa)";
                  const tagBg = qDone ? "#dcfce7" : isAlmost ? "#ede9fe" : "#f3f4f6";
                  const tagColor = qDone ? "#15803d" : isAlmost ? "#6d28d9" : "#6b7280";
                  const gemBg = qDone ? "#dcfce7" : isAlmost ? "#ede9fe" : "#f3f4f6";
                  const gemBorder = qDone ? "#86efac" : isAlmost ? "#c4b5fd" : "#e5e7eb";
                  const gemColor = qDone ? "#15803d" : isAlmost ? "#6d28d9" : "#9ca3af";

                  return (
                    <div key={q.id}>
                      {showDoneLabel && (
                        <div style={{ fontSize: "11px", fontWeight: "800", color: "#15803d", textTransform: "uppercase", letterSpacing: "1.5px", margin: "6px 0 10px", display: "flex", alignItems: "center", gap: "8px" }}>
                          <div style={{ flex: 1, height: "1.5px", background: "linear-gradient(90deg,transparent,#86efac)" }} />
                          ✅ Đã hoàn thành ({done.length})
                          <div style={{ flex: 1, height: "1.5px", background: "linear-gradient(90deg,#86efac,transparent)" }} />
                        </div>
                      )}
                      <div style={{
                        background: cardBg,
                        border: cardBorder,
                        borderRadius: "14px",
                        padding: "11px 12px",
                        display: "flex",
                        alignItems: "center",
                        gap: "11px",
                        boxShadow: cardShadow,
                        opacity: qDone ? 0.82 : 1,
                        transition: "transform 0.15s",
                      }}>
                        {/* Icon */}
                        <div style={{
                          width: "42px", height: "42px", borderRadius: "12px", flexShrink: 0,
                          background: qDone ? "#bbf7d0" : isAlmost ? "#ddd6fe" : "#f3f4f6",
                          border: qDone ? "1.5px solid #86efac" : isAlmost ? "1.5px solid #c4b5fd" : "1.5px solid #e5e7eb",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "20px",
                        }}>
                          {qDone ? "✅" : q.icon}
                        </div>

                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {/* Name row */}
                          <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "3px", flexWrap: "wrap" }}>
                            <span style={{ fontSize: "13px", fontWeight: "800", color: nameColor, lineHeight: 1.2 }}>
                              {q.name}
                            </span>
                            <span style={{
                              fontSize: "9px", fontWeight: "700",
                              color: tagColor, background: tagBg,
                              borderRadius: "99px", padding: "2px 7px", flexShrink: 0,
                              border: `1px solid ${gemBorder}`,
                            }}>{catLabel[q.category] || q.category}</span>
                          </div>
                          {/* Desc */}
                          <div style={{ fontSize: "11px", color: descColor, marginBottom: "6px", lineHeight: 1.3 }}>{q.desc}</div>

                          {/* Progress bar */}
                          <div style={{ height: "6px", background: barBg, borderRadius: "99px", overflow: "hidden" }}>
                            <div style={{
                              height: "100%",
                              width: `${pct}%`,
                              background: barFill,
                              borderRadius: "99px",
                              transition: "width 0.5s ease",
                            }} />
                          </div>
                          {/* Progress text */}
                          <div style={{ fontSize: "10px", color: descColor, opacity: 0.7, marginTop: "3px", fontWeight: "600" }}>
                            {qDone ? "Hoàn thành! 🎉" : `${q.cur.toLocaleString()} / ${q.max.toLocaleString()} · ${pct}%`}
                          </div>
                        </div>

                        {/* Gem reward */}
                        <div style={{
                          flexShrink: 0, textAlign: "center",
                          background: gemBg,
                          border: `1.5px solid ${gemBorder}`,
                          borderRadius: "12px", padding: "7px 10px", minWidth: "50px",
                        }}>
                          <div style={{ fontSize: "15px", lineHeight: 1 }}>{qDone ? "💎" : "🔮"}</div>
                          <div style={{ fontSize: "11px", fontWeight: "900", color: gemColor, marginTop: "3px" }}>
                            +{q.gem.toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div style={{
                marginTop: "14px", padding: "12px", borderRadius: "12px",
                background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)",
                fontSize: "11px", color: "#92400e", textAlign: "center", lineHeight: 1.7,
              }}>
                ♾️ Nhiệm vụ mới tự xuất hiện khi bạn hoàn thành mốc hiện tại<br/>
                <span style={{ color: "#d97706", fontWeight: "700" }}>💎 Phần thưởng tăng dần theo cấp độ mốc</span>
              </div>
            </div>
          );
        })()}
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

      {/* Modal cho ăn vật nuôi */}
      {showLivestockFeedMenu && feedTargetAnimalId && (() => {
        const animal = livestock.find(a => a.id === feedTargetAnimalId);
        if (!animal) return null;
        const ltype = LIVESTOCK_TYPES.find(l => l.id === animal.type);
        return (
          <div onClick={() => { setShowLivestockFeedMenu(false); setFeedTargetAnimalId(null); }} style={S.itemMenuOverlay}>
            <div onClick={e=>e.stopPropagation()} style={S.itemMenuBox}>
              <div style={{fontSize:"36px",marginBottom:"6px"}}>{ltype.emoji}</div>
              <h3 style={{margin:"0 0 4px 0"}}>Cho {ltype.name} ăn</h3>
              <div style={{fontSize:"12px",color:"#78716c",marginBottom:"12px"}}>Thức ăn hợp lệ: {ltype.foodEmoji} {ltype.foodName}</div>
              <div style={{display:"flex",flexDirection:"column",gap:"8px",marginBottom:"16px"}}>
                {ltype.food.map(fid => {
                  const crop = CROP_TYPES.find(c => c.produce?.id === fid);
                  const qty = produceInventory[fid] || 0;
                  return (
                    <button key={fid} onClick={() => feedAnimal(feedTargetAnimalId, fid)} disabled={qty<=0} style={{
                      display:"flex",alignItems:"center",gap:"12px",
                      padding:"10px 14px",borderRadius:"12px",
                      background:qty>0?"linear-gradient(135deg,#dcfce7,#d1fae5)":"#f3f4f6",
                      border:`2px solid ${qty>0?"#34d399":"#e5e7eb"}`,
                      cursor:qty>0?"pointer":"not-allowed",fontFamily:"inherit",
                      opacity:qty>0?1:0.5,
                    }}>
                      <span style={{fontSize:"24px"}}>{crop?.produce?.emoji}</span>
                      <div style={{textAlign:"left"}}>
                        <div style={{fontWeight:"800",fontSize:"13px",color:qty>0?"#065f46":"#9ca3af"}}>{crop?.produce?.name}</div>
                        <div style={{fontSize:"11px",color:qty>0?"#16a34a":"#d1d5db"}}>Kho: <b>{qty}</b> cái</div>
                      </div>
                      {qty>0 && <span style={{marginLeft:"auto",fontSize:"18px"}}>✅</span>}
                    </button>
                  );
                })}
              </div>
              <button onClick={() => { setShowLivestockFeedMenu(false); setFeedTargetAnimalId(null); }} style={{width:"100%",padding:"10px",background:"#e5e7eb",border:"none",borderRadius:"10px",cursor:"pointer",fontWeight:"600",fontSize:"14px"}}>Hủy</button>
            </div>
          </div>
        );
      })()}

      {/* ===== MODAL ĐỔI HẠT GIỐNG LẤY XU ===== */}
      {showSeedTradeModal && (
        <div onClick={() => setShowSeedTradeModal(false)} style={{
          position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:1100,
          display:"flex",alignItems:"center",justifyContent:"center",padding:"16px",
        }}>
          <div onClick={e=>e.stopPropagation()} style={{
            background:"linear-gradient(160deg,#fffbeb,#fef3c7,#fff7ed)",
            borderRadius:"24px",padding:"24px",maxWidth:"360px",width:"100%",
            border:"2px solid #fbbf24",boxShadow:"0 8px 32px rgba(251,191,36,0.25)",
            animation:"popIn 0.3s ease-out",
          }}>
            <div style={{textAlign:"center",marginBottom:"16px"}}>
              <div style={{fontSize:"48px"}}>🌱→🪙</div>
              <h3 style={{margin:"6px 0 4px",fontSize:"18px",fontWeight:"900",color:"#78350f"}}>Đổi Hạt Giống Lấy Xu</h3>
              <div style={{fontSize:"13px",color:"#92400e"}}>
                Bạn có: <strong style={{color:"#16a34a"}}>{seeds} hạt</strong>
              </div>
            </div>

            <div style={{display:"flex",flexDirection:"column",gap:"10px",marginBottom:"16px"}}>
              {SEED_TRADE_OPTIONS.map(opt => (
                <button key={opt.seeds} onClick={() => tradeSeedsForCoins(opt)}
                  disabled={seeds < opt.seeds}
                  style={{
                    display:"flex",alignItems:"center",justifyContent:"space-between",
                    padding:"12px 16px",borderRadius:"14px",
                    background: seeds >= opt.seeds
                      ? "linear-gradient(135deg,#fff7ed,#fef3c7)"
                      : "#f3f4f6",
                    border: seeds >= opt.seeds ? "1.5px solid #f59e0b" : "1.5px solid #e5e7eb",
                    cursor: seeds >= opt.seeds ? "pointer" : "not-allowed",
                    opacity: seeds >= opt.seeds ? 1 : 0.5,
                    fontFamily:"inherit",
                    boxShadow: seeds >= opt.seeds ? "0 2px 8px rgba(245,158,11,0.15)" : "none",
                  }}>
                  <div style={{textAlign:"left"}}>
                    <div style={{fontSize:"15px",fontWeight:"900",color: seeds >= opt.seeds ? "#92400e" : "#6b7280"}}>
                      {opt.label}
                    </div>
                    <div style={{fontSize:"11px",color:"#9ca3af"}}>{opt.desc}</div>
                  </div>
                  <div style={{
                    background: seeds >= opt.seeds ? "linear-gradient(135deg,#f59e0b,#fbbf24)" : "#d1d5db",
                    color:"white",borderRadius:"10px",padding:"6px 14px",
                    fontWeight:"800",fontSize:"13px",
                  }}>
                    {seeds >= opt.seeds ? "Đổi ngay" : `Thiếu ${opt.seeds - seeds} hạt`}
                  </div>
                </button>
              ))}
            </div>

            <div style={{
              background:"rgba(245,158,11,0.1)",borderRadius:"12px",padding:"10px 14px",
              fontSize:"11px",color:"#92400e",textAlign:"center",marginBottom:"14px",
            }}>
              💡 Mẹo: Học từ để nhận hạt miễn phí. Tỉ lệ đổi tốt hơn khi đổi nhiều hạt một lúc!
            </div>

            <button onClick={() => setShowSeedTradeModal(false)} style={{
              width:"100%",padding:"12px",background:"linear-gradient(135deg,#374151,#4b5563)",
              color:"white",border:"none",borderRadius:"14px",
              fontWeight:"800",fontSize:"14px",cursor:"pointer",fontFamily:"inherit",
            }}>✕ Đóng</button>
          </div>
        </div>
      )}
      {/* ===== CROP PICKER POPUP ===== */}
      {showCropPicker && pendingPlotId !== null && (
        <div onClick={() => setShowCropPicker(false)} style={S.itemMenuOverlay}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "white", borderRadius: "24px", padding: "20px 16px",
            width: "92%", maxWidth: "360px",
            boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          }}>
            <div style={{ textAlign: "center", marginBottom: "14px" }}>
              <div style={{ fontSize: "28px" }}>🌱</div>
              <div style={{ fontWeight: "900", fontSize: "15px", color: "#166534" }}>Chọn giống cây trồng</div>
              <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "2px" }}>Có {seeds} 🌱 hạt giống</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {CROP_TYPES.map((crop) => {
                const canPlant = !crop.seasons || crop.seasons.includes(season);
                const currentCount = plots.filter(p => p.stage >= 1 && p.crop === crop.id).length;
                const seasonCrops = CROP_TYPES.filter(c => !c.seasons || c.seasons.includes(season));
                const baseTotal = seasonCrops.reduce((s, c) => s + (c.maxSeeds || 4), 0);
                const scaleFactor = baseTotal > 0 ? plotCount / baseTotal : 1;
                const dynamicMax = Math.max(crop.maxSeeds || 1, Math.ceil((crop.maxSeeds || 1) * scaleFactor));
                const isFull = currentCount >= dynamicMax;
                const disabled = !canPlant || isFull;
                return (
                  <button key={crop.id} onClick={() => {
                    if (disabled) { notify(!canPlant ? `❌ ${crop.emoji} Không trồng được mùa này!` : `🚫 ${crop.emoji} Đã đủ ${dynamicMax} mầm!`, "#ef4444"); return; }
                    setSelectedCrop(crop);
                    setShowCropPicker(false);
                    plantOnPlot(pendingPlotId, crop);
                    setPendingPlotId(null);
                  }} style={{
                    display: "flex", alignItems: "center", gap: "10px",
                    padding: "10px 14px", borderRadius: "14px",
                    background: disabled ? "rgba(0,0,0,0.04)" : `linear-gradient(135deg, ${crop.color}18, ${crop.color}08)`,
                    border: `1.5px solid ${disabled ? "transparent" : crop.color + "44"}`,
                    cursor: disabled ? "not-allowed" : "pointer",
                    opacity: disabled ? 0.5 : 1,
                    fontFamily: "inherit", textAlign: "left",
                    transition: "all 0.12s",
                  }}>
                    <span style={{ fontSize: "28px", lineHeight: 1 }}>{crop.emoji}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: "800", fontSize: "13px", color: disabled ? "#9ca3af" : "#1f2937" }}>
                        {crop.name}
                      </div>
                      <div style={{ fontSize: "10px", color: "#6b7280", marginTop: "1px" }}>
                        🪙{crop.reward} · +{crop.expReward}EXP · ⏱{crop.growTime}s
                        {crop.produce && ` · →${crop.produce.qty}${crop.produce.emoji}`}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", minWidth: "44px" }}>
                      <div style={{ fontSize: "11px", fontWeight: "800", color: isFull ? "#ef4444" : canPlant ? "#16a34a" : "#9ca3af" }}>
                        {currentCount}/{dynamicMax}
                      </div>
                      <div style={{ fontSize: "9px", color: "#9ca3af" }}>mầm</div>
                    </div>
                  </button>
                );
              })}
            </div>
            <button onClick={() => setShowCropPicker(false)} style={{
              marginTop: "14px", width: "100%", padding: "10px",
              borderRadius: "12px", border: "none", background: "#f3f4f6",
              fontWeight: "700", fontSize: "13px", color: "#6b7280",
              cursor: "pointer", fontFamily: "inherit",
            }}>Huỷ</button>
          </div>
        </div>
      )}

      {showItemMenu && selectedItemId && (
        <div onClick={() => { setShowItemMenu(false); setSelectedItemId(null); }} style={S.itemMenuOverlay}>
          <div onClick={e => e.stopPropagation()} style={S.itemMenuBox}>
            <div style={{ fontSize: "32px", marginBottom: "6px" }}>🎯</div>
            <h3 style={{ margin: "0 0 4px 0" }}>Chọn ô đất để dùng</h3>

            {selectedItemId === "pesticide_single" && (
              <div style={{
                fontSize: "12px", color: "#ef4444", fontWeight: "700",
                background: "#fef2f2", border: "1px solid #fecaca",
                borderRadius: "8px", padding: "5px 10px", marginBottom: "10px",
              }}>
                🐛 Chỉ dùng được trên ô đang có sâu (viền đỏ)
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(3, plotCount)}, 1fr)`, gap: "10px", marginBottom: "16px" }}>
              {plots.map((plot, idx) => {
                const isPest = plot.hasPest;
                const isPesticide = selectedItemId === "pesticide_single";
                const isDisabled = isPesticide ? !isPest : (plot.stage === 0 || plot.stage === 3);

                let bg, border, labelColor, shadow;
                if (isPest) {
                  bg = "linear-gradient(135deg,#fee2e2,#fecaca)";
                  border = "2.5px solid #ef4444";
                  shadow = "0 0 12px rgba(239,68,68,0.40)";
                  labelColor = "#b91c1c";
                } else if (plot.stage === 0) {
                  bg = "#f3f4f6"; border = "2px solid #d1d5db"; shadow = "none"; labelColor = "#9ca3af";
                } else if (plot.stage === 3) {
                  bg = "linear-gradient(135deg,#d1fae5,#a7f3d0)"; border = "2px solid #34d399"; shadow = "none"; labelColor = "#065f46";
                } else {
                  bg = "linear-gradient(135deg,#eff6ff,#dbeafe)"; border = "2px solid #93c5fd"; shadow = "none"; labelColor = "#1e40af";
                }

                return (
                  <button
                    key={plot.id}
                    onClick={() => !isDisabled && useItemOnPlot(plot.id, selectedItemId)}
                    disabled={isDisabled}
                    style={{
                      padding: "12px 6px", background: bg, border, borderRadius: "12px",
                      cursor: isDisabled ? "not-allowed" : "pointer",
                      opacity: isDisabled ? 0.38 : 1,
                      boxShadow: shadow,
                      transition: "transform 0.15s",
                      position: "relative",
                    }}
                  >
                    {isPest && (
                      <div style={{
                        position: "absolute", top: "-9px", right: "-7px",
                        background: "#ef4444", color: "white",
                        fontSize: "10px", fontWeight: "800",
                        borderRadius: "20px", padding: "2px 6px",
                        boxShadow: "0 2px 6px rgba(239,68,68,0.5)",
                        animation: "shake 0.45s infinite",
                      }}>🐛 SÂU!</div>
                    )}
                    <div style={{ fontSize: "11px", fontWeight: "700", color: labelColor, marginBottom: "4px" }}>Ô {idx + 1}</div>
                    <div style={{ fontSize: "22px" }}>
                      {isPest ? "🐛" : plot.stage === 0 ? "🟫" : plot.stage === 3 ? "🌾" : "🌱"}
                    </div>
                    {isPest && (
                      <div style={{ fontSize: "10px", color: "#dc2626", fontWeight: "700", marginTop: "3px" }}>Có sâu!</div>
                    )}
                  </button>
                );
              })}
            </div>
            <button onClick={() => { setShowItemMenu(false); setSelectedItemId(null); }} style={{
              width: "100%", padding: "10px", background: "#e5e7eb",
              border: "none", borderRadius: "10px", cursor: "pointer",
              fontWeight: "600", fontSize: "14px",
            }}>Hủy</button>
          </div>
        </div>
      )}
    </div>
  );
}