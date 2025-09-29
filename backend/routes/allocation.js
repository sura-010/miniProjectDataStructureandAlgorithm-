const express = require("express");
const pool = require("../db");
const router = express.Router();

// ✅ API เพิ่มการจัดสรรงบประมาณ
router.post("/add", async (req, res) => {
  try {
    const {
      budget_id,
      target_group_id,
      allocation_percentage,
      max_recipients,
    } = req.body;

    if (
      !budget_id ||
      !target_group_id ||
      allocation_percentage == null ||
      max_recipients == null
    ) {
      return res.status(400).json({
        error:
          "กรุณาระบุ budget_id, target_group_id, allocation_percentage และ max_recipients",
      });
    }

    // ✅ ดึงข้อมูลงบประมาณ
    const budgetResult = await pool.query(
      "SELECT total_budget FROM BudgetConfig WHERE id = $1",
      [budget_id]
    );
    if (budgetResult.rowCount === 0) {
      return res.status(404).json({ error: "ไม่พบบัญชีงบประมาณที่ระบุ" });
    }
    let { total_budget } = budgetResult.rows[0];

    // ✅ ตรวจสอบเปอร์เซ็นต์รวม
    const currentTotalResult = await pool.query(
      `SELECT COALESCE(SUM(allocation_percentage), 0) AS total FROM AllocationRatio WHERE budget_id = $1`,
      [budget_id]
    );
    const currentTotal = parseFloat(currentTotalResult.rows[0].total);
    const newTotal = currentTotal + allocation_percentage;

    if (newTotal > 100) {
      return res
        .status(400)
        .json({ error: `รวมเปอร์เซ็นต์เกิน 100% (${newTotal}%)` });
    }

    // ✅ คำนวณงบที่จัดสรร
    const allocated_amount = (allocation_percentage / 100) * total_budget;

    // ✅ เพิ่ม AllocationRatio
    await pool.query(
      `INSERT INTO AllocationRatio (budget_id, target_group_id, allocation_percentage, max_recipients, allocated_amount)
             VALUES ($1, $2, $3, $4, $5)`,
      [
        budget_id,
        target_group_id,
        allocation_percentage,
        max_recipients,
        allocated_amount,
      ]
    );

    // ✅ คำนวณ remaining_budget ใหม่
    const totalAllocatedResult = await pool.query(
      `SELECT COALESCE(SUM(allocated_amount), 0) AS total_allocated FROM AllocationRatio WHERE budget_id = $1`,
      [budget_id]
    );
    const totalAllocatedAmount = parseFloat(
      totalAllocatedResult.rows[0].total_allocated
    );
    const new_remaining_budget = total_budget - totalAllocatedAmount;

    // ✅ อัปเดต remaining_budget
    const updateBudget = await pool.query(
      `UPDATE BudgetConfig SET remaining_budget = $1 WHERE id = $2 RETURNING remaining_budget`,
      [new_remaining_budget, budget_id]
    );

    res.json({
      message: "เพิ่มข้อมูลการจัดสรรสำเร็จ",
      budget_id,
      target_group_id,
      allocation_percentage,
      max_recipients,
      allocated_amount: allocated_amount.toFixed(2),
      remaining_budget: parseFloat(
        updateBudget.rows[0].remaining_budget
      ).toFixed(2),
    });
  } catch (err) {
    console.error("INSERT AllocationRatio Error:", err.message);
    res.status(500).json({ error: "Server Error", details: err.message });
  }
});

// ✅ API อัปเดตการจัดสรรงบประมาณ
router.put("/update", async (req, res) => {
  try {
    const {
      budget_id,
      target_group_id,
      allocation_percentage,
      max_recipients,
    } = req.body;

    if (
      !budget_id ||
      !target_group_id ||
      allocation_percentage == null ||
      max_recipients == null
    ) {
      return res.status(400).json({
        error:
          "กรุณาระบุ budget_id, target_group_id, allocation_percentage และ max_recipients",
      });
    }

    // ✅ ดึงข้อมูลงบประมาณ
    const budgetResult = await pool.query(
      "SELECT total_budget FROM BudgetConfig WHERE id = $1",
      [budget_id]
    );
    if (budgetResult.rowCount === 0) {
      return res.status(404).json({ error: "ไม่พบบัญชีงบประมาณที่ระบุ" });
    }
    let { total_budget } = budgetResult.rows[0];

    // ✅ ตรวจสอบเปอร์เซ็นต์รวม (ยกเว้นข้อมูลที่ต้องการอัปเดต)
    const currentTotalResult = await pool.query(
      `SELECT COALESCE(SUM(allocation_percentage), 0) AS total FROM AllocationRatio 
             WHERE budget_id = $1 AND target_group_id <> $2`,
      [budget_id, target_group_id]
    );
    const currentTotal = parseFloat(currentTotalResult.rows[0].total);
    const newTotal = currentTotal + allocation_percentage;

    if (newTotal > 100) {
      return res
        .status(400)
        .json({ error: `รวมเปอร์เซ็นต์เกิน 100% (${newTotal}%)` });
    }

    // ✅ คำนวณงบที่จัดสรรใหม่
    const new_allocated_amount = (allocation_percentage / 100) * total_budget;

    // ✅ อัปเดต AllocationRatio
    await pool.query(
      `UPDATE AllocationRatio 
             SET allocation_percentage = $1, max_recipients = $2, allocated_amount = $3 
             WHERE budget_id = $4 AND target_group_id = $5`,
      [
        allocation_percentage,
        max_recipients,
        new_allocated_amount,
        budget_id,
        target_group_id,
      ]
    );

    // ✅ คำนวณ remaining_budget ใหม่
    const totalAllocatedResult = await pool.query(
      `SELECT COALESCE(SUM(allocated_amount), 0) AS total_allocated FROM AllocationRatio WHERE budget_id = $1`,
      [budget_id]
    );
    const totalAllocatedAmount = parseFloat(
      totalAllocatedResult.rows[0].total_allocated
    );
    const new_remaining_budget = total_budget - totalAllocatedAmount;

    // ✅ อัปเดต remaining_budget
    const updateBudget = await pool.query(
      `UPDATE BudgetConfig SET remaining_budget = $1 WHERE id = $2 RETURNING remaining_budget`,
      [new_remaining_budget, budget_id]
    );


    res.json({
      message: "อัปเดตการจัดสรรสำเร็จ",
      budget_id,
      target_group_id,
      updated_allocation_percentage: allocation_percentage,
      max_recipients,
      allocated_amount: new_allocated_amount.toFixed(2),
      remaining_budget: parseFloat(
        updateBudget.rows[0].remaining_budget
      ).toFixed(2),
    });
  } catch (err) {
    console.error("UPDATE AllocationRatio Error:", err.message);
    res.status(500).json({ error: "Server Error", details: err.message });
  }
});


// ✅ API ดูรายละเอียดการจัดสรรทั้งหมด
router.get("/get", async (req, res) => {
  try {
    const allocationResult = await pool.query(
      ` SELECT 
           bc.id AS budget_id, 
            bc.project_name, 
            ar.target_group_id,  -- ✅ เพิ่ม target_group_id ตรงนี้
            tg.name AS target_group, 
            ar.allocation_percentage, 
            ar.allocated_amount, 
            ar.max_recipients,
            bc.remaining_budget,
            CASE 
                WHEN ar.max_recipients > 0 THEN ROUND(ar.allocated_amount / ar.max_recipients, 2)
                ELSE NULL 
            END AS amount_per_person
        FROM AllocationRatio ar
        JOIN TargetGroup tg ON ar.target_group_id = tg.target_group_id
        JOIN BudgetConfig bc ON ar.budget_id = bc.id
        ORDER BY bc.id ASC, ar.target_group_id ASC;`
    );

    res.json(allocationResult.rows);
  } catch (err) {
    console.error("GET Allocation Details Error:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
});

router.get("/get/:budget_id", async (req, res) => {
  try {
    const { budget_id } = req.params;
    const allocationResult = await pool.query(
      `SELECT bc.id AS budget_id, 
                    bc.project_name, 
                    tg.name AS target_group, 
                    ar.target_group_id,  -- ✅ เพิ่ม target_group_id ตรงนี
                    ar.allocation_percentage, 
                    ar.allocated_amount, 
                    ar.max_recipients,
                    bc.remaining_budget,
                    CASE 
                        WHEN ar.max_recipients > 0 THEN ROUND(ar.allocated_amount / ar.max_recipients, 2)
                        ELSE NULL 
                    END AS amount_per_person
             FROM AllocationRatio ar
             JOIN TargetGroup tg ON ar.target_group_id = tg.target_group_id
             JOIN BudgetConfig bc ON ar.budget_id = bc.id
             WHERE bc.id = $1
             ORDER BY ar.target_group_id ASC`,
      [budget_id]
    );

    if (allocationResult.rowCount === 0) {
      return res
        .status(404)
        .json({ error: "ไม่พบข้อมูลการจัดสรรสำหรับ budget_id นี้" });
    }

    res.json({
      budget_id,
      allocations: allocationResult.rows,
    });
  } catch (err) {
    console.error("GET Allocation Details Error:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
});

module.exports = router;
