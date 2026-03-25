const express = require("express");
const router = express.Router();
const { pipeline } = require("@xenova/transformers");
const fs = require("fs");
const path = require("path");
const Report = require("../models/Report");

// 🧠 Load AI model (singleton)
let classifier;

async function loadModel() {
  if (!classifier) {
    console.log("🔄 Loading AI model (first time only)...");
    classifier = await pipeline(
      "zero-shot-image-classification",
      "Xenova/clip-vit-base-patch32"
    );
    console.log("✅ Model loaded");
  }
  return classifier;
}

// 🧠 Damage processing logic
function processDamage(text) {
  text = (text || "").toLowerCase();

  let damageType = "Unknown";
  let severity = "Low";
  let score = 0;
  let infrastructure = "Unknown";

  if (text.includes("collapse") || text.includes("broken")) {
    damageType = "Structural Collapse";
    score = 90;
  } else if (text.includes("pothole")) {
    damageType = "Pothole";
    score = 60;
  } else if (text.includes("bridge") && text.includes("crack")) {
    damageType = "Bridge Crack";
    score = 75;
  } else if (text.includes("crack")) {
    damageType = "Surface Crack";
    score = 40;
  } else if (text.includes("normal")) {
    damageType = "No Damage";
    score = 5;
  }

  if (text.includes("bridge")) {
    infrastructure = "bridge";
  } else if (text.includes("building")) {
    infrastructure = "building";
  } else if (text.includes("road") || text.includes("pothole")) {
    infrastructure = "road";
  }

  if (score >= 80) severity = "Critical";
  else if (score >= 50) severity = "High";
  else if (score >= 30) severity = "Moderate";
  else severity = "Low";

  return { damageType, severity, risk: score, infrastructure };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/analyze — Run AI analysis
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.post("/", async (req, res) => {
  try {
    const { image, location, saveReport: shouldSave } = req.body;

    if (!image) {
      return res.status(400).json({ success: false, error: "No image provided" });
    }

    await loadModel();
    console.log("🧠 Running AI analysis...");

    // Remove base64 prefix and save temp file
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    const filePath = path.join(__dirname, "..", "temp_" + Date.now() + ".jpg");
    fs.writeFileSync(filePath, base64Data, "base64");

    const labels = [
      "pothole road",
      "road crack",
      "bridge damage",
      "building collapse",
      "normal road",
    ];

    const result = await classifier(filePath, labels);
    console.log("AI RESULT:", result);

    const topPrediction = result[0].label.toLowerCase();
    const processed = processDamage(topPrediction);

    // Clean up temp file
    fs.unlinkSync(filePath);

    const analysisResult = {
      success: true,
      caption: topPrediction,
      confidence: result[0].score,
      allPredictions: result,
      ...processed,
    };

    // 💾 Auto-save to database if requested
    if (shouldSave !== false) {
      try {
        const report = new Report({
          reportId: `ai_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          timestamp: Date.now(),
          location: location || {
            lat: 0,
            lng: 0,
            address: "Quick Analysis — Location not specified",
          },
          description: `AI Analysis: ${processed.damageType} detected`,
          imageBase64: image,
          analysis: {
            damageType: processed.damageType,
            severity: processed.severity,
            risk: processed.risk,
            infrastructure: processed.infrastructure,
            caption: topPrediction,
          },
          status: "Pending",
          submittedBy: "AI Analysis Tool",
        });

        await report.save();
        analysisResult.reportId = report.reportId;
        console.log("💾 Auto-saved report:", report.reportId);
      } catch (dbError) {
        console.warn("⚠️ Could not save to DB:", dbError.message);
      }
    }

    res.json(analysisResult);
  } catch (error) {
    console.error("❌ Analysis error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/analyze/test — Test route
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/test", (req, res) => {
  const sampleText = "a road with potholes and cracks";
  const result = processDamage(sampleText);

  res.json({
    success: true,
    caption: sampleText,
    ...result,
  });
});

module.exports = router;