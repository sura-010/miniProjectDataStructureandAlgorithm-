const express = require("express");
const pool = require("../db");
const router = express.Router();

router.get("/get", async (req, res) => {
  try {
    // ✅ ดึงข้อมูลงบประมาณทั้งหมด
    const budgetResult = await pool.query(
      `SELECT 
                SUM(total_budget) AS total_budget, 
                SUM(remaining_budget) AS total_remaining_budget 
             FROM BudgetConfig`
    );

    // ✅ ดึงข้อมูลการจัดสรรของแต่ละกลุ่ม
    const allocationResult = await pool.query(`
            SELECT 
                ar.budget_id,
                bc.project_name AS budget_name,
                ar.target_group_id,
                tg.name AS group_name,
                ar.allocated_amount,
                COALESCE(SUM(CASE WHEN t.status = 'completed' THEN t.amount ELSE 0 END), 0) AS total_paid, -- ✅ รวมเงินที่จ่ายไปจริง
                COUNT(DISTINCT CASE WHEN t.status = 'completed' THEN t.citizen_id END) AS received_count, -- ✅ จำนวนคนที่ได้รับเงินแล้ว
                COUNT(DISTINCT CASE WHEN t.status = 'pending' THEN t.citizen_id END) AS pending_count, -- ✅ จำนวนคนที่รอรับเงิน
                COUNT(DISTINCT ci.citizen_id) AS total_citizens, -- ✅ จำนวนประชาชนทั้งหมดในกลุ่ม
                (ar.allocated_amount - COALESCE(SUM(CASE WHEN t.status = 'completed' THEN t.amount ELSE 0 END), 0)) AS remaining_budget -- ✅ เงินคงเหลือที่ถูกต้อง
            FROM AllocationRatio ar
            JOIN BudgetConfig bc ON ar.budget_id = bc.id
            JOIN TargetGroup tg ON ar.target_group_id = tg.target_group_id
            LEFT JOIN Transaction t ON ar.id = t.allocation_id
            LEFT JOIN Citizens ci ON ar.target_group_id = ci.target_group_id
            GROUP BY ar.budget_id, bc.project_name, ar.target_group_id, tg.name, ar.allocated_amount
            ORDER BY ar.budget_id, ar.target_group_id
        `);

    res.json({
      total_budget: parseFloat(budgetResult.rows[0].total_budget).toFixed(2),
      total_remaining_budget: parseFloat(
        budgetResult.rows[0].total_remaining_budget
      ).toFixed(2),
      groups: allocationResult.rows,
    });
  } catch (err) {
    console.error("REPORT API Error:", err.message);
    res.status(500).json({ error: "Server Error", details: err.message });
  }
});

module.exports = router;
