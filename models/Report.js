const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
  {
    // Unique report ID (keep your existing format)
    reportId: {
      type: String,
      required: true,
      unique: true,
      default: () => `rpt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    },

    // Timestamp
    timestamp: {
      type: Number,
      default: () => Date.now(),
    },

    // Location data
    location: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
      address: { type: String, default: "Location not specified" },
    },

    // Report details
    description: {
      type: String,
      default: "",
    },

    // Image (stored as base64 or URL)
    imageUrl: { type: String, default: "" },
    imageBase64: { type: String, default: "" },

    // AI Analysis Results
    analysis: {
      damageType: {
        type: String,
        enum: [
          "Pothole",
          "Surface Crack",
          "Bridge Crack",
          "Structural Collapse",
          "Unknown",
          "No Damage",
        ],
        default: "Unknown",
      },
      severity: {
        type: String,
        enum: ["Low", "Moderate", "High", "Critical"],
        default: "Low",
      },
      risk: {
        type: Number,
        min: 0,
        max: 100,
        default: 0,
      },
      infrastructure: {
        type: String,
        enum: ["road", "bridge", "building", "Unknown"],
        default: "Unknown",
      },
      caption: { type: String, default: "" },
    },

    // Report status
    status: {
      type: String,
      enum: ["Pending", "In Progress", "Resolved", "Rejected"],
      default: "Pending",
    },

    // Who submitted
    submittedBy: {
      type: String,
      default: "Anonymous",
    },

    // Hardware data (from Pico)
    hardwareData: {
      iriValue: { type: Number, default: null },
      triggerTime: { type: Number, default: null },
      sensorRaw: { type: mongoose.Schema.Types.Mixed, default: null },
    },
  },
  {
    timestamps: true, // adds createdAt and updatedAt
  }
);

// Indexes for faster queries
reportSchema.index({ timestamp: -1 });
reportSchema.index({ "analysis.severity": 1 });
reportSchema.index({ "analysis.damageType": 1 });
reportSchema.index({ status: 1 });
reportSchema.index({ "location.lat": 1, "location.lng": 1 });

module.exports = mongoose.model("Report", reportSchema);