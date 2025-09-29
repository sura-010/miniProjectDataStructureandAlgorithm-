const secretCode = process.env.SECRET_CODE;

const authenticate = (req, res, next) => {
    const secretHeader = req.headers.secret || req.headers.authorization?.split(" ")[1]; // รองรับทั้ง secret และ Bearer
    console.log("🔹 Header secret:", secretHeader);
    console.log("🔹 ENV SECRET_CODE:", secretCode);

    if (!secretHeader || secretHeader !== secretCode) {
        return res.status(403).json({ message: "รหัสลับไม่ถูกต้อง!" });
    }
    next();
};

module.exports = authenticate;
