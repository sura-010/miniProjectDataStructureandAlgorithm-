const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db"); // เชื่อมกับ Database
const router = express.Router();
const authenticate = require("../middleware/authMiddleware");

// SECRET KEY สำหรับ JWT
const JWT_SECRET = process.env.SECRET_CODE;

// ✅ [POST] Admin Login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    // ค้นหา Admin จาก Database
    const result = await pool.query("SELECT * FROM admin WHERE email = $1", [
      email,
    ]);

    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const admin = result.rows[0];

    // ตรวจสอบรหัสผ่าน
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // สร้าง JWT Token พร้อม role: "admin"
    const token = jwt.sign(
      { adminId: admin.admin_id, email: admin.email, role: "admin" }, // เพิ่ม role
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({ message: "Login successful", token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});
router.put("/update/:national_id", authenticate, async (req, res) => {
  const { national_id } = req.params; // รับเลขบัตรประชาชนจาก params
  const { fname, lname, birth_date, income, occupation } = req.body;

  try {
    // ตรวจสอบข้อมูลที่ได้รับจาก request body
    if (!fname || !lname || !birth_date || !income || !occupation) {
      return res.status(400).json({ message: "ข้อมูลไม่ครบถ้วน" });
    }

    // ตรวจสอบวันที่และอายุ
    const birthDate = new Date(birth_date);
    if (isNaN(birthDate.getTime())) {
      return res.status(400).json({ message: "รูปแบบวันเกิดไม่ถูกต้อง" });
    }

    const age = calculateAge(birthDate);
    if (age < 18 || age > 99) {
      return res
        .status(400)
        .json({ message: "อายุจะต้องอยู่ในช่วง 18 - 99 ปี" });
    }

    if (income < 0) {
      return res
        .status(400)
        .json({ message: "รายได้ต้องเป็นจำนวนที่มากกว่าหรือเท่ากับ 0" });
    }

    // คำนวณ target_group_id
    let target_group_id = null;
    const groupQuery = await pool.query(
      `SELECT target_group_id FROM TargetGroup WHERE age_min <= $1 AND age_max >= $1 AND income_range_min <= $2 AND income_range_max >= $2 LIMIT 1`,
      [age, income]
    );

    if (groupQuery.rowCount > 0) {
      target_group_id = groupQuery.rows[0].target_group_id;
    }

    // ตรวจสอบอาชีพ
    if (!target_group_id && occupation.includes("เกษตรกร")) {
      target_group_id = 3; // กลุ่มเกษตรกร
    }

    if (!target_group_id && !occupation.includes("เกษตรกร")) {
      target_group_id = 4; // กลุ่มอื่นๆ
    }

    // ตรวจสอบว่าเลขบัตรประชาชนมีในฐานข้อมูล
    const citizenCheck = await pool.query(
      `SELECT * FROM citizens WHERE national_id = $1`,
      [national_id]
    );

    if (citizenCheck.rowCount === 0) {
      return res
        .status(404)
        .json({ message: "ไม่พบข้อมูลประชาชนที่ต้องการแก้ไข" });
    }

    // อัปเดตข้อมูลประชาชนในฐานข้อมูล
    const result = await pool.query(
      `UPDATE citizens SET fname = $1, lname = $2, national_id = $3, birth_date = $4, age = $5, income = $6, occupation = $7, target_group_id = $8 WHERE national_id = $9 RETURNING *`,
      [
        fname,
        lname,
        national_id,
        birthDate,
        age,
        income,
        occupation,
        target_group_id,
        national_id,
      ]
    );

    res.json({
      message: "ข้อมูลประชาชนถูกแก้ไขเรียบร้อยแล้ว",
      updatedCitizen: result.rows[0],
    });
  } catch (err) {
    console.error("UPDATE Error:", err.message);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดในการอัปเดตข้อมูล" });
  }
});

// ฟังก์ชันคำนวณอายุ
function calculateAge(birth_date) {
  const birthDate = new Date(birth_date);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }
  return age;
}

  
module.exports = router;
