const express = require("express");
const router = express.Router();
const Report = require("../models/Report");

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/reports — Get all reports
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/", async (req, res) => {
  try {
    const {
      status,
      severity,
      damageType,
      infrastructure,
      limit = 100,
      page = 1,
      sort = "-timestamp",
    } = req.query;

    // Build filter
    const filter = {};
    if (status) filter.status = status;
    if (severity) filter["analysis.severity"] = severity;
    if (damageType) filter["analysis.damageType"] = damageType;
    if (infrastructure) filter["analysis.infrastructure"] = infrastructure;

    const skip = (Number(page) - 1) * Number(limit);

    const [reports, total] = await Promise.all([
      Report.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Report.countDocuments(filter),
    ]);

    // Map _id to id for frontend compatibility
    const mapped = reports.map((r) => ({
      id: r.reportId,
      ...r,
    }));

    res.json({
      success: true,
      data: mapped,
      pagination: {
        total,
        page: Number(page),
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error("❌ GET /api/reports error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/reports/:id — Get single report
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/:id", async (req, res) => {
  try {
    const report = await Report.findOne({ reportId: req.params.id }).lean();

    if (!report) {
      return res.status(404).json({ success: false, error: "Report not found" });
    }

    res.json({ success: true, data: { id: report.reportId, ...report } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/reports — Create new report
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.post("/", async (req, res) => {
  try {
    const {
      id,
      timestamp,
      location,
      description,
      imageUrl,
      imageBase64,
      analysis,
      status,
      submittedBy,
      hardwareData,
    } = req.body;

    const report = new Report({
      reportId: id || `rpt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: timestamp || Date.now(),
      location: location || { lat: 0, lng: 0, address: "Unknown" },
      description: description || "",
      imageUrl: imageUrl || "",
      imageBase64: imageBase64 || "",
      analysis: analysis || {},
      status: status || "Pending",
      submittedBy: submittedBy || "Anonymous",
      hardwareData: hardwareData || {},
    });

    await report.save();

    console.log("✅ Report saved:", report.reportId);

    res.status(201).json({
      success: true,
      data: { id: report.reportId, ...report.toObject() },
    });
  } catch (error) {
    console.error("❌ POST /api/reports error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PUT /api/reports/:id — Update report
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.put("/:id", async (req, res) => {
  try {
    const report = await Report.findOneAndUpdate(
      { reportId: req.params.id },
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!report) {
      return res.status(404).json({ success: false, error: "Report not found" });
    }

    res.json({ success: true, data: { id: report.reportId, ...report.toObject() } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DELETE /api/reports/:id — Delete report
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.delete("/:id", async (req, res) => {
  try {
    const report = await Report.findOneAndDelete({ reportId: req.params.id });

    if (!report) {
      return res.status(404).json({ success: false, error: "Report not found" });
    }

    res.json({ success: true, message: "Report deleted" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DELETE /api/reports — Delete ALL reports
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.delete("/", async (req, res) => {
  try {
    const result = await Report.deleteMany({});
    res.json({ success: true, message: `Deleted ${result.deletedCount} reports` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/reports/stats/dashboard — Dashboard stats
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/stats/dashboard", async (req, res) => {
  try {
    const [
      total,
      pending,
      inProgress,
      resolved,
      bySeverity,
      byDamageType,
      byInfrastructure,
      recentReports,
    ] = await Promise.all([
      Report.countDocuments(),
      Report.countDocuments({ status: "Pending" }),
      Report.countDocuments({ status: "In Progress" }),
      Report.countDocuments({ status: "Resolved" }),
      Report.aggregate([
        { $group: { _id: "$analysis.severity", count: { $sum: 1 } } },
      ]),
      Report.aggregate([
        { $group: { _id: "$analysis.damageType", count: { $sum: 1 } } },
      ]),
      Report.aggregate([
        { $group: { _id: "$analysis.infrastructure", count: { $sum: 1 } } },
      ]),
      Report.find().sort({ timestamp: -1 }).limit(5).lean(),
    ]);

    res.json({
      success: true,
      data: {
        total,
        byStatus: { pending, inProgress, resolved },
        bySeverity: Object.fromEntries(bySeverity.map((s) => [s._id, s.count])),
        byDamageType: Object.fromEntries(byDamageType.map((d) => [d._id, d.count])),
        byInfrastructure: Object.fromEntries(byInfrastructure.map((i) => [i._id, i.count])),
        recentReports: recentReports.map((r) => ({ id: r.reportId, ...r })),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;