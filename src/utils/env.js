export const privateKey = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, "\n");
export const publicKey = process.env.JWT_PUBLIC_KEY.replace(/\\n/g, "\n");

export const keyId = process.env.JWT_KEY_ID || "v1";

export const oldPublicKey = process.env.JWT_OLD_PUBLIC_KEY
  ? process.env.JWT_OLD_PUBLIC_KEY.replace(/\\n/g, "\n")
  : null;

export const oldKeyId = process.env.JWT_OLD_KEY_ID || null;

export const oldKeyExpiry = process.env.JWT_OLD_KEY_EXPIRES
  ? new Date(process.env.JWT_OLD_KEY_EXPIRES)
  : null;
