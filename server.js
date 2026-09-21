const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split("?")[0]);
  if (url === "/") url = "/index.html";
  const filePath = path.join(ROOT, url);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("404 Not Found");
    }
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": mime,
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(data);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  const os = require("os");
  const nets = os.networkInterfaces();
  let ip = "127.0.0.1";
  for (const iface of Object.values(nets)) {
    for (const n of iface) {
      if (n.family === "IPv4" && !n.internal) { ip = n.address; break; }
    }
  }
  console.log("📸 دفتر التصوير يعمل الآن!");
  console.log("");
  console.log("  من جهازك:  http://localhost:" + PORT);
  console.log("  من الآيفون: http://" + ip + ":" + PORT);
  console.log("");
  console.log("افتح هذا الرابط من الآيفون ثم أضفه للشاشة الرئيسية.");
});