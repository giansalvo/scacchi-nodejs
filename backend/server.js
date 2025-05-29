// backend/server.js

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
const dotenv = require("dotenv");

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(cors());
app.use(express.json());
app.use("/static", express.static(path.join(__dirname, "../frontend")));

// Environment variable check
const SERVER_PORT = process.env.SERVER_PORT;
if (!SERVER_PORT) {
  throw new Error("Missing required environment variable: SERVER_PORT");
}
console.log("=== ENVIRONMENT ===");
console.log(`SERVER_PORT = ${SERVER_PORT}`);

let state = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
const activeConnections = new Set();

// Routes
app.get("/hello", (req, res) => {
  res.send("HELLO!!");
});

app.get("/", (req, res) => {
  const filePath = path.join(__dirname, "../frontend/index.html");
  fs.readFile(filePath, "utf-8", (err, data) => {
    if (err) {
      res.status(500).send(`Cannot read index.html: ${err.message}`);
    } else {
      res.send(data);
    }
  });
});

app.get("/api/state", (req, res) => {
  res.json({ fen: state });
});

app.post("/api/move", (req, res) => {
  const move = req.body.move;
  const fen = req.body.fen;
  state = fen;
  console.log("[DEBUG] Received move:", move, "FEN:", fen);

  const payload = JSON.stringify({ move: move || "placeholder", fen });
  activeConnections.forEach((ws) => {
    try {
      ws.send(payload);
    } catch (err) {
      console.error("[ERROR] Sending to client:", err.message);
    }
  });

  res.json({ status: "ok" });
});

app.get("/api/health", (req, res) => {
  res.json({ connection: "ok" });
});

wss.on("connection", (ws, req) => {
  const clientIp = req.socket.remoteAddress || "unknown";
  activeConnections.add(ws);
  console.log(`[CONNECT] Client connected from ${clientIp}. Total: ${activeConnections.size}`);

  ws.on("message", (message) => {
    console.log(`[MESSAGE] From ${clientIp}: ${message.toString().slice(0, 100)}...`);
    try {
      const data = JSON.parse(message);
      const broadcast = JSON.stringify({
        sender: clientIp,
        message: data,
        timestamp: new Date().toISOString(),
      });
      activeConnections.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(broadcast);
        }
      });
    } catch (e) {
      ws.send("Error: Invalid JSON format");
    }
  });

  ws.on("close", () => {
    activeConnections.delete(ws);
    console.log(`[DISCONNECT] Client ${clientIp} disconnected. Remaining: ${activeConnections.size}`);
  });

  ws.on("error", (err) => {
    console.error(`[ERROR] WebSocket error from ${clientIp}:`, err);
  });
});

server.listen(SERVER_PORT, () => {
  console.log(`[INFO] Server is running on http://0.0.0.0:${SERVER_PORT}`);
});
