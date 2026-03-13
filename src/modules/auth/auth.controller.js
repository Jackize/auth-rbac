import { userRepository } from "../../repository/user.repository.js";
import { signAccessToken } from "../../utils/jwt.js";
import { hashPassword, verifyPassword } from "../../utils/password.js";
import { signRefreshToken } from "../../utils/refreshToken.js";

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    let user = await userRepository.findByEmail(email);

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    if (user.status === "LOCKED") {
      const unlocked = await userRepository.unlockIfExpired(user);
      if (unlocked) {
        user = unlocked;
      } else if (user.lockedUntil && user.lockedUntil > new Date()) {
        const retryAfterSeconds = Math.ceil(
          (user.lockedUntil.getTime() - Date.now()) / 1000,
        );
        return res.status(403).json({
          error:
            "Account temporarily locked due to too many failed login attempts.",
          lockedUntil: user.lockedUntil.toISOString(),
          retryAfterSeconds,
        });
      } else {
        // LOCKED nhưng không có lockedUntil (dữ liệu cũ) — vẫn chặn
        return res.status(403).json({
          error: "Account is locked. Contact support.",
        });
      }
    }

    const isValid = await verifyPassword(user.password, password);

    if (!isValid) {
      const failResult = await userRepository.recordFailedLogin(user.id);
      if (failResult.locked && failResult.lockedUntil) {
        return res.status(403).json({
          error:
            "Account temporarily locked due to too many failed login attempts.",
          lockedUntil: failResult.lockedUntil.toISOString(),
          retryAfterSeconds: Math.ceil(
            (failResult.lockedUntil.getTime() - Date.now()) / 1000,
          ),
        });
      }
      return res.status(401).json({ error: "Invalid email or password" });
    }

    await userRepository.resetFailedLoginAttempts(user.id);

    // const getRole = await userRepository.getUserRole(user.id)

    const acessToken = await signAccessToken({
      userId: user.id,
      tokenVersion: user.tokenVersion,
      // roles: getRole
    });

    const userId = user.id;
    const deviceId = req.headers["user-agent"] || "unknown";
    const refreshToken = await signRefreshToken(userId, deviceId);

    res
      .status(200)
      .json({
        message: "Login successful",
        accessToken: acessToken,
        refreshToken,
      });
  } catch (error) {
    next(error);
  }
};

export const register = async (req, res, next) => {
  try {
    const { email, username, password } = req.body;

    const existingUser = await userRepository.findByEmail(email);

    if (existingUser) {
      return res.status(409).json({ error: "Email already exists" });
    }

    const hashedPassword = await hashPassword(password);

    await userRepository.create({ email, username, password: hashedPassword });

    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    next(error);
  }
};

export const getProfile = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const user = await userRepository.findById(userId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(200).json({ email: user.email, status: user.status });
  } catch (error) {
    next(error);
  }
};
