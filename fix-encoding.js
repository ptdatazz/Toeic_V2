// fix-encoding.js
const fs = require("fs");
const path = "./src/App.jsx";
let content = fs.readFileSync(path, "utf8");
const before = content.length;
content = content.normalize("NFC");
fs.writeFileSync(path, content, "utf8");
console.log("Trước:", before, "ký tự | Sau:", content.length, "ký tự");