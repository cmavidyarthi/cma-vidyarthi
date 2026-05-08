const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

// Static frontend
const FRONTEND = path.join(__dirname, "frontend");
app.use(express.static(FRONTEND));

console.log("📂 Serving files from:", FRONTEND);

// Vercel temporary writable folder
const DATA_DIR = "/tmp/cma-data";
const FILE = path.join(DATA_DIR, "data.json");

// Create folder
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Create file
if (!fs.existsSync(FILE)) {
    fs.writeFileSync(FILE, "[]");
}

console.log("💾 Data stored at:", FILE);

// Save exam
app.post("/addExam", (req, res) => {
    let exams = [];

    try {
        exams = JSON.parse(fs.readFileSync(FILE, "utf8"));
    } catch {
        exams = [];
    }

    exams.push(req.body);

    fs.writeFileSync(FILE, JSON.stringify(exams, null, 2));

    console.log("✅ Saved:", req.body.student_id);

    res.json({ success: true });
});

// Get exams
app.get("/getExams/:id", (req, res) => {
    let exams = [];

    try {
        exams = JSON.parse(fs.readFileSync(FILE, "utf8"));
    } catch {
        exams = [];
    }

    const userExams = exams.filter(
        e => String(e.student_id).trim() === String(req.params.id).trim()
    );

    res.json(userExams);
});

// Export for Vercel
module.exports = app;
