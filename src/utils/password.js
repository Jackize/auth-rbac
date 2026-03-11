import argon2 from "argon2";

/**
 * Hash password using Argon2id
 * @param {string} plainPassword
 * @returns {Promise<string>} hashed password
 */
async function hashPassword(plainPassword) {
  if (!plainPassword || typeof plainPassword !== "string") {
    throw new Error("Invalid password input");
  }

  return argon2.hash(plainPassword, {
    type: argon2.argon2id,   // recommended variant
    memoryCost: 2 ** 16,     // 64MB
    timeCost: 3,             // iterations
    parallelism: 1
  });
}

/**
 * Verify password
 * @param {string} hashedPassword
 * @param {string} plainPassword
 * @returns {Promise<boolean>}
 */
async function verifyPassword(hashedPassword, plainPassword) {
  if (!hashedPassword || !plainPassword) {
    return false;
  }

  return argon2.verify(hashedPassword, plainPassword);
}

export { hashPassword, verifyPassword };
