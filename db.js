// db.js — Production Ready (Render + MongoDB Atlas)

const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI;

    if (!uri) {
      console.log("❌ MONGODB_URI is not set!");
      console.log("💡 Add MONGODB_URI in Render Environment Variables");
      return false;
    }

    console.log("🔄 Connecting to MongoDB...");
    console.log("📍 URI starts with:", uri.substring(0, 30) + "...");

    await mongoose.connect(uri);

    console.log("✅ MongoDB Connected:", mongoose.connection.host);

    mongoose.connection.on("error", (err) => {
      console.error("❌ MongoDB error:", err);
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("⚠️ MongoDB disconnected");
    });

    return true;
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error.message);
    return false;
  }
};

module.exports = connectDB;