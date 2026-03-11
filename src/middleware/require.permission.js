import { hasPermission } from "../permissions/hasPermission.js";
import { userRepository } from "../repository/user.repository.js";

export function requirePermission(permission) {
  return async (req, res, next) => {

    const user = req.user

    if (!user) {
      return res.status(401).json({ error: "Unauthorized" })
    }

    const findPermissions = await userRepository.getUserPermissions(user.userId);

    if (!hasPermission(findPermissions, permission)) {
      return res.status(403).json({ error: "Forbidden" })
    }

    next()
  }
}