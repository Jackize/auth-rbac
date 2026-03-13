/**
 * Sau số lần sai mật khẩu liên tiếp thì khóa tài khoản trong một khoảng thời gian.
 * Env: MAX_FAILED_LOGIN_ATTEMPTS (mặc định 5), LOCK_DURATION_MINUTES (mặc định 15).
 */
export const MAX_FAILED_LOGIN_ATTEMPTS = Math.max(
  1,
  parseInt(process.env.MAX_FAILED_LOGIN_ATTEMPTS || "5", 10) || 5,
);

export const LOCK_DURATION_MINUTES = Math.max(
  1,
  parseInt(process.env.LOCK_DURATION_MINUTES || "15", 10) || 15,
);

/** Thời điểm lockedUntil khi khóa ngay bây giờ */
export function lockedUntilDate() {
  return new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000);
}
