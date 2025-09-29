const { faker } = require("@faker-js/faker");
const pool = require("../db"); // เชื่อมต่อฐานข้อมูล

async function generateFakeCitizens(count = 10) {
  try {
    for (let i = 0; i < count; i++) {
      const fname = faker.person.firstName();
      const lname = faker.person.lastName();
      const national_id = faker.number
        .int({ min: 5000000000000, max: 5999999999999 })
        .toString();
      const birth_date = faker.date.between({
        from: "1960-01-01",
        to: "2005-12-31",
      });
      const age = new Date().getFullYear() - birth_date.getFullYear();
      const income = faker.number.int({ min: 3000, max: 50000 }).toFixed(2);
      const occupation = faker.helpers.arrayElement([
        "เกษตรกร",
        "พนักงานบริษัท",
        "ข้าราชการ",
        "อาชีพอิสระ",
      ]);

      let target_group_id = null;
      if (age >= 60) target_group_id = 1;
      else if (income < 9000) target_group_id = 2;
      else if (occupation === "เกษตรกร") target_group_id = 3;
      else target_group_id = 4;

      await pool.query(
        `INSERT INTO citizens (fname, lname, national_id, birth_date, age, income, occupation, target_group_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          fname,
          lname,
          national_id,
          birth_date,
          age,
          income,
          occupation,
          target_group_id,
        ]
      );
    }
    console.log("เพิ่มข้อมูลปลอมจำนวน ${count} รายการสำเร็จ!");
  } catch (err) {
    console.error("❌ Error inserting fake data:", err.message);
  }
}

generateFakeCitizens(20); // สร้างข้อมูลปลอม 20 รายการ
