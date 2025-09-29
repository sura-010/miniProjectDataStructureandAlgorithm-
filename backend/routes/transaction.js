const express = require("express");
const pool = require("../db"); // เชื่อมต่อฐานข้อมูล
const router = express.Router();

router.put("/update", async (req, res) => {
  try {
    const { transaction_id, citizen_id, status, target_group_id, budget_id } =
      req.body;

    if (
      !transaction_id ||
      !citizen_id ||
      !status ||
      !target_group_id ||
      !budget_id
    ) {
      return res.status(400).json({
        error:
          "กรุณาระบุ transaction_id, citizen_id, status, target_group_id และ budget_id",
      });
    }

    // ✅ ตรวจสอบว่าธุรกรรมมีอยู่จริง
    const checkTransaction = await pool.query(
      `SELECT * FROM transaction WHERE transaction_id = $1 AND citizen_id = $2`,
      [transaction_id, citizen_id]
    );

    if (checkTransaction.rowCount === 0) {
      return res.status(404).json({ error: "ไม่พบธุรกรรมที่ต้องการอัปเดต" });
    }

    // ✅ อัปเดตสถานะธุรกรรม
    const updateTransaction = await pool.query(
      `UPDATE transaction 
             SET status = $1 
             WHERE transaction_id = $2 AND citizen_id = $3 RETURNING *`,
      [status, transaction_id, citizen_id]
    );

    if (updateTransaction.rowCount === 0) {
      return res
        .status(500)
        .json({ error: "เกิดข้อผิดพลาดในการอัปเดตธุรกรรม" });
    }

    let deducted_amount = 0;
    let distribution_recorded = false;

    // ✅ ลด allocated_amount ใน AllocationRatio ถ้าสถานะเป็น completed
    if (status === "completed") {
      // ดึงข้อมูล amount_per_person จาก AllocationRatio
      const allocationResult = await pool.query(
        `SELECT allocated_amount, max_recipients 
                 FROM AllocationRatio 
                 WHERE budget_id = $1 AND target_group_id = $2`,
        [budget_id, target_group_id]
      );

      if (allocationResult.rowCount === 0) {
        return res
          .status(400)
          .json({ error: "ไม่พบข้อมูลการจัดสรรสำหรับกลุ่มเป้าหมายนี้" });
      }

      const { allocated_amount, max_recipients } = allocationResult.rows[0];
      const amount_per_person =
        max_recipients > 0 ? allocated_amount / max_recipients : 0;

      if (allocated_amount >= amount_per_person && amount_per_person > 0) {
        // หักจำนวนที่จ่ายออกจาก allocated_amount
        const new_allocated_amount = allocated_amount - amount_per_person;
        deducted_amount = amount_per_person;

        await pool.query(
          `UPDATE AllocationRatio 
                     SET allocated_amount = $1 
                     WHERE budget_id = $2 AND target_group_id = $3`,
          [new_allocated_amount, budget_id, target_group_id]
        );

        // ✅ อัปเดต remaining_budget ใน BudgetConfig
        const totalAllocatedResult = await pool.query(
          `SELECT COALESCE(SUM(allocated_amount), 0) AS total_allocated 
                     FROM AllocationRatio 
                     WHERE budget_id = $1`,
          [budget_id]
        );

        const totalAllocatedAmount = parseFloat(
          totalAllocatedResult.rows[0].total_allocated
        );
        const budgetResult = await pool.query(
          `SELECT total_budget FROM BudgetConfig WHERE id = $1`,
          [budget_id]
        );

        const total_budget = parseFloat(budgetResult.rows[0].total_budget);
        const new_remaining_budget = total_budget - totalAllocatedAmount;

        await pool.query(
          `UPDATE BudgetConfig 
                     SET remaining_budget = $1 
                     WHERE id = $2`,
          [new_remaining_budget, budget_id]
        );

        // ✅ บันทึกวันที่แจกเงินใน funddistributionschedule
        await pool.query(
          `INSERT INTO funddistributionschedule (target_group_id, distribution_date)
                     VALUES ($1, NOW())`,
          [target_group_id]
        );

        distribution_recorded = true;
      } else {
        return res
          .status(400)
          .json({ error: "งบประมาณไม่เพียงพอที่จะจ่ายให้กับกลุ่มเป้าหมายนี้" });
      }
    }

    res.json({
      message: "อัปเดตสถานะธุรกรรมสำเร็จ",
      transaction: updateTransaction.rows[0],
      deducted_amount: deducted_amount.toFixed(2),
      distribution_recorded,
    });
  } catch (err) {
    console.error("UPDATE Transaction Error:", err.message);
    res.status(500).json({ error: "Server Error", details: err.message });
  }
});

router.get("/get", async (req, res) => {
  try {
    const result = pool.query(
      ` SELECT 
    ta.transaction_id, -- ✅ เพิ่ม transaction_id
    ci.citizen_id,
    ci.fname,
    ci.lname,
    ci.national_id,
    ci.birth_date,
    ci.age,
    ci.income,
    ci.occupation,
    tg.target_group_id,
    tg.name AS group_name,
    ar.budget_id, -- ✅ เพิ่ม budget_id จาก allocationratio
    ta.status,
    ci.created_at
FROM Citizens ci
JOIN TargetGroup tg ON ci.target_group_id = tg.target_group_id
JOIN Transaction ta ON ci.citizen_id = ta.citizen_id
LEFT JOIN AllocationRatio ar ON ci.target_group_id = ar.target_group_id -- ใช้ LEFT JOIN เผื่อกรณีไม่มี budget_id
ORDER BY ci.target_group_id ASC, ci.created_at ASC; `
    );
    res.json((await result).rows);
  } catch {
    res.status(500).json({ message: "Server Error" });
  }
});


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
                ar.allocated_amount - COALESCE(SUM(t.amount), 0) AS remaining_budget,
                COUNT(DISTINCT CASE WHEN t.status = 'completed' THEN t.citizen_id END) AS received_count,
                COUNT(DISTINCT CASE WHEN t.status = 'pending' THEN t.citizen_id END) AS pending_count,
                COUNT(DISTINCT ci.citizen_id) AS total_citizens
            FROM AllocationRatio ar
            JOIN BudgetConfig bc ON ar.budget_id = bc.id
            JOIN TargetGroup tg ON ar.target_group_id = tg.target_group_id
            LEFT JOIN Transaction t ON ar.id = t.allocation_id -- ✅ เปลี่ยนจาก allocation_id เป็น id
            LEFT JOIN Citizens ci ON ar.target_group_id = ci.target_group_id
            GROUP BY ar.budget_id, bc.project_name, ar.target_group_id, tg.name, ar.allocated_amount
            ORDER BY ar.budget_id, ar.target_group_id
        `);

        res.json({
            total_budget: parseFloat(budgetResult.rows[0].total_budget).toFixed(2),
            total_remaining_budget: parseFloat(budgetResult.rows[0].total_remaining_budget).toFixed(2),
            groups: allocationResult.rows
        });

    } catch (err) {
        console.error("REPORT API Error:", err.message);
        res.status(500).json({ error: "Server Error", details: err.message });
    }
});

module.exports = router;

