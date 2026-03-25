const mongoose = require("mongoose");
require("dotenv").config();

const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/anveshana";

    await mongoose.connect(uri);

    console.log("✅ MongoDB Connected:", mongoose.connection.host);

    // Handle connection events
    mongoose.connection.on("error", (err) => {
      console.error("❌ MongoDB error:", err);
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("⚠️ MongoDB disconnected");
    });

  } catch (error) {
    console.error("❌ MongoDB connection failed:", error.message);
    console.log("💡 Make sure MongoDB is running or check your MONGODB_URI in .env");
    console.log("💡 Falling back to in-memory mode...");
    return false;
  }
  return true;
};

module.exports = connectDB;