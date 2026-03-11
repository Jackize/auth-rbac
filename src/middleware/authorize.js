import { userRepository } from "../repository/user.repository.js";
import { verifyAccessToken } from "../utils/jwt.js";

export const authorize = async (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
        return res.status(401).json({ error: "Access token missing" });
    }

    try {
        const payload = await verifyAccessToken(token);
        
        // compare token version
        const user = await userRepository.findById(payload.userId, {
            select: { tokenVersion: true }
        });
        if (!user || user.tokenVersion !== payload.tokenVersion) {
            return res.status(401).json({ error: "Invalid token version" });
        }
        req.user = payload; // gắn thông tin user vào request
        next();
    } catch (error) {
        console.log("error", error);
        return res.status(401).json({ error: "Invalid or expired token" });
    }
}