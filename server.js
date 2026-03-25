// server.js — FINAL WORKING VERSION

console.log("Starting server...");

const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { pipeline } = require("@xenova/transformers");
const fs = require("fs");
const path = require("path");

const app = express();

// ─────────────────────────────────────────
// DB + MODEL LOADING
// ─────────────────────────────────────────
let connectDB;
try {
  connectDB = require("./db");
} catch {
  connectDB = async () => false;
}

let Report;
try {
  Report = require("./models/Report");
} catch {
  Report = null;
}

// ─────────────────────────────────────────
// ✅ FIXED CORS (CRITICAL)
// ─────────────────────────────────────────
app.use(
  cors({
    origin: true, // allow all origins dynamically
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: false,
  })
);

// ✅ HANDLE PREFLIGHT REQUESTS
app.options("*", cors());

// OPTIONAL EXTRA SAFETY
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE");
  next();
});

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

console.log("Middleware configured");

// ─────────────────────────────────────────
// AI MODEL (Singleton)
// ─────────────────────────────────────────
let classifier;
async function loadModel() {
  if (!classifier) {
    console.log("Loading AI model...");
    classifier = await pipeline(
      "zero-shot-image-classification",
      "Xenova/clip-vit-base-patch32"
    );
    console.log("AI model loaded");
  }
  return classifier;
}

// ─────────────────────────────────────────
// DAMAGE ENGINE
// ─────────────────────────────────────────
function processDamage(text) {
  text = (text || "").toLowerCase();

  let damageType = "Unknown";
  let severity = "Low";
  let score = 10;
  let infrastructure = "Unknown";

  if (text.includes("electric") || text.includes("pole") || text.includes("wire")) {
    damageType = "Power Infrastructure Damage";
    infrastructure = "utilities";
    score = 90;
  } else if (text.includes("flood") || text.includes("water")) {
    damageType = "Flooding / Waterlogging";
    infrastructure = "drainage";
    score = 85;
  } else if (text.includes("pothole")) {
    damageType = "Pothole";
    infrastructure = "road";
    score = 60;
  } else if (text.includes("crack")) {
    damageType = "Crack Damage";
    infrastructure = "road/bridge";
    score = 50;
  } else if (text.includes("bridge")) {
    damageType = "Bridge Damage";
    infrastructure = "bridge";
    score = 70;
  } else if (text.includes("building")) {
    damageType = "Building Damage";
    infrastructure = "building";
    score = 70;
  } else if (text.includes("tree")) {
    damageType = "Fallen Tree";
    infrastructure = "roadside";
    score = 55;
  }

  if (score >= 85) severity = "Critical";
  else if (score >= 60) severity = "High";
  else if (score >= 40) severity = "Moderate";

  return { damageType, severity, risk: score, infrastructure };
}

// ─────────────────────────────────────────
// ANALYZE ROUTE
// ─────────────────────────────────────────
app.post("/api/analyze", async (req, res) => {
  try {
    const { image, location, saveReport = true } = req.body;

    if (!image) {
      return res.status(400).json({ success: false, error: "No image provided" });
    }

    await loadModel();
    console.log("Running AI analysis...");

    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    const filePath = path.join(__dirname, "temp.jpg");
    fs.writeFileSync(filePath, base64Data, "base64");

    const labels = [
      "damaged electric pole",
      "flooded street",
      "pothole road",
      "cracked road",
      "broken bridge",
      "damaged building",
      "fallen tree",
      "normal road"
    ];

    const result = await classifier(filePath, labels);

    const top = result[0];
    const processed = processDamage(top.label);

    fs.unlinkSync(filePath);

    const response = {
      success: true,
      caption: top.label,
      confidence: top.score,
      ...processed,
    };

    // Save to DB
    if (saveReport && Report) {
      try {
        const report = new Report({
          reportId: `ai_${Date.now()}`,
          timestamp: Date.now(),
          location,
          imageBase64: image,
          analysis: response,
        });
        await report.save();
        response.reportId = report.reportId;
      } catch {}
    }

    res.json(response);
  } catch (err) {
    console.error("Analysis error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────
// REPORT ROUTES
// ─────────────────────────────────────────
app.use("/api/reports", require("./routes/reports"));

// ─────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "running", message: "Backend live" });
});

// ─────────────────────────────────────────
// ✅ FIXED HEALTH ROUTE
// ─────────────────────────────────────────
app.get("/api/health", async (req, res) => {
  const mongoose = require("mongoose");

  res.json({
    success: true,
    data: {
      server: "running",
      database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    },
  });
});

// ─────────────────────────────────────────
// ✅ TEST ROUTE (REQUIRED BY FRONTEND)
// ─────────────────────────────────────────
app.get("/api/analyze/test", (req, res) => {
  const result = processDamage("damaged electric pole");

  res.json({
    success: true,
    data: {
      caption: "test",
      ...result,
      confidence: 0.95,
    },
  });
});

// ─────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────
const PORT = process.env.PORT || 5000;

async function start() {
  await connectDB().catch(() => {});
  app.listen(PORT, () => {
    console.log(`Server running on ${PORT}`);
  });
}

start();