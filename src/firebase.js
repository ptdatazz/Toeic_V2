import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD2f_vjmbJVIP6Z8eHxGpEOkzIpWa3WKGc",
  authDomain: "toeic-master-fbd74.firebaseapp.com",
  projectId: "toeic-master-fbd74",
  storageBucket: "toeic-master-fbd74.firebasestorage.app",
  messagingSenderId: "767042810983",
  appId: "1:767042810983:web:9c213b2495ee068512d0c2",
  measurementId: "G-1BG85XY7NM"
};

// Khởi tạo Firebase
const app = initializeApp(firebaseConfig);

// Xuất các công cụ Auth (Đăng nhập) và Database (Lưu điểm) để App.jsx dùng
export const auth = getAuth(app);
export const db = getFirestore(app);