// server.js — PRODUCTION READY (MongoDB + AI + CORS Fixed)

console.log("Starting server...");

const express = require("express");
console.log("Express loaded");

const cors = require("cors");
console.log("CORS loaded");

require("dotenv").config();
console.log("Dotenv loaded");
console.log("MONGODB_URI:", process.env.MONGODB_URI || "NOT SET");

const { pipeline } = require("@xenova/transformers");
const fs = require("fs");
const path = require("path");

// Load DB connection
let connectDB;
try {
  connectDB = require("./db");
  console.log("db.js loaded");
} catch (err) {
  console.log("db.js error:", err.message);
  connectDB = async () => false;
}

// Load Report model
let Report;
try {
  Report = require("./models/Report");
  console.log("Report model loaded");
} catch (err) {
  console.log("Report model error:", err.message);
  Report = null;
}

const app = express();

// MIDDLEWARE — CORS FIXED FOR PRODUCTION
app.use(cors()); // Allow all origins (Vercel, localhost, etc.)
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

console.log("Middleware configured");

// AI MODEL (Singleton)
let classifier;
async function loadModel() {
  if (!classifier) {
    console.log("Loading AI model (first time only)...");
    classifier = await pipeline(
      "zero-shot-image-classification",
      "Xenova/clip-vit-base-patch32"
    );
    console.log("AI model loaded");
  }
  return classifier;
}

// DAMAGE PROCESSING ENGINE
function processDamage(text) {
  text = (text || "").toLowerCase();

  let damageType = "Unknown";
  let severity = "Low";
  let score = 10;
  let infrastructure = "Unknown";

  if (text.includes("electric") || text.includes("power") || text.includes("pole") || text.includes("wire")) {
    damageType = "Power Infrastructure Damage";
    infrastructure = "utilities";
    score = 90;
  }
  else if (text.includes("flood") || text.includes("water") || text.includes("overflow") || text.includes("submerged")) {
    damageType = "Flooding / Waterlogging";
    infrastructure = "drainage / road / residential";
    score = 85;
  }
  else if (text.includes("pothole")) {
    damageType = "Pothole";
    infrastructure = "road";
    score = 60;
  }
  else if (text.includes("crack") && (text.includes("road") || text.includes("bridge"))) {
    damageType = text.includes("bridge") ? "Bridge Crack" : "Road Crack";
    infrastructure = text.includes("bridge") ? "bridge" : "road";
    score = text.includes("bridge") ? 75 : 45;
  }
  else if (text.includes("broken road") || text.includes("damaged road")) {
    damageType = "Road Damage";
    infrastructure = "road";
    score = 70;
  }
  else if (text.includes("bridge")) {
    infrastructure = "bridge";
    damageType = "Bridge Damage";
    score = 70;
  }
  else if (text.includes("building") && !text.includes("pole")) {
    infrastructure = "building";
    damageType = text.includes("collapse") ? "Building Collapse" : "Building Damage";
    score = text.includes("collapse") ? 100 : 70;
  }
  else if (text.includes("landslide")) {
    damageType = "Landslide";
    infrastructure = "terrain";
    score = 80;
  }
  else if (text.includes("tree")) {
    damageType = "Fallen Tree Obstruction";
    infrastructure = "roadside";
    score = 55;
  }
  else if (text.includes("normal") || text.includes("no damage")) {
    damageType = "No Damage";
    infrastructure = "none";
    score = 0;
  }

  if (score >= 85) severity = "Critical";
  else if (score >= 60) severity = "High";
  else if (score >= 40) severity = "Moderate";
  else severity = "Low";

  return { damageType, severity, risk: score, infrastructure };
}

// ANALYZE ROUTE
app.post("/api/analyze", async (req, res) => {
  try {
    const { image, location, saveReport = true } = req.body;

    if (!image) {
      return res.status(400).json({ success: false, error: "No image provided" });
    }

    await loadModel();
    console.log("Running AI analysis...");

    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    const filePath = path.join(__dirname, "temp_" + Date.now() + ".jpg");
    fs.writeFileSync(filePath, base64Data, "base64");

    const labels = [
      "a damaged electric pole", "a tilted electric pole with hanging wires", "broken power lines on a pole",
      "a flooded street with water covering houses", "a waterlogged road after heavy rain",
      "a road with large potholes", "a cracked asphalt road", "a severely damaged broken road",
      "a collapsed building", "a broken bridge", "a cracked bridge structure",
      "a landslide blocking road", "fallen trees blocking road",
      "damaged infrastructure utilities", "a normal clean road", "no visible damage"
    ];

    const result = await classifier(filePath, labels);
    const topPredictions = result.slice(0, 3).map(r => r.label.toLowerCase());
    const combinedText = topPredictions.join(" ");
    const processed = processDamage(combinedText);

    fs.unlinkSync(filePath);

    const analysisResult = {
      success: true,
      caption: topPredictions[0],
      predictions: topPredictions,
      confidence: result[0].score,
      ...processed,
    };

    // Auto-save to MongoDB
    if (saveReport && Report) {
      try {
        const report = new Report({
          reportId: `ai_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          timestamp: Date.now(),
          location: location || { lat: 0, lng: 0, address: "AI Analysis" },
          description: `AI Detected: ${processed.damageType}`,
          imageBase64: image,
          analysis: {
            damageType: processed.damageType,
            severity: processed.severity,
            risk: processed.risk,
            infrastructure: processed.infrastructure,
            caption: topPredictions[0],
          },
          status: "Pending",
          submittedBy: "AI System",
        });
        await report.save();
        analysisResult.reportId = report.reportId;
        console.log("Report saved:", report.reportId);
      } catch (err) {
        console.warn("Could not save report:", err.message);
      }
    }

    res.json(analysisResult);
  } catch (error) {
    console.error("Analysis error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ROUTES
let reportRoutes;
try {
  reportRoutes = require("./routes/reports");
  app.use("/api/reports", reportRoutes);
} catch (err) {
  console.log("Report routes not loaded:", err.message);
}

// HEALTH & TEST
app.get("/", (req, res) => {
  res.json({ status: "running", message: "Anveshana AI Backend v3" });
});

app.get("/api/health", async (req, res) => {
  const mongoose = require("mongoose");
  res.json({
    success: true,
    server: "running",
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

app.get("/test", (req, res) => {
  const result = processDamage("damaged electric pole");
  res.json({ success: true, caption: "Test", ...result });
});

console.log("Routes configured");

// START SERVER
const PORT = process.env.PORT || 5000;

async function startServer() {
  console.log("Connecting to database...");
  let dbConnected = false;
  try {
    dbConnected = await connectDB();
  } catch (err) {
    console.log("DB connection failed:", err.message);
  }

  app.listen(PORT, () => {
    console.log("\n════════════════════════════════════════════");
    console.log("   Anveshana AI Backend v3.0");
    console.log("   Server: http://localhost:" + PORT);
    console.log("   Database: " + (dbConnected ? "Connected" : "Not Connected"));
    console.log("   AI Model: Ready");
    console.log("════════════════════════════════════════════\n");
  });
}

startServer();