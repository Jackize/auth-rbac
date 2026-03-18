import { decodeProtectedHeader, importPKCS8, importSPKI, jwtVerify, SignJWT } from "jose";
import { keyId, oldKeyExpiry, oldKeyId, oldPublicKey, privateKey, publicKey } from "./env.js";

const privateKeyObj = await importPKCS8(privateKey, "RS256");
const publicKeyObj = await importSPKI(publicKey, "RS256");

const oldPublicKeyObj = oldPublicKey
  ? await importSPKI(oldPublicKey, "RS256")
  : null;

export const signAccessToken = async (payload) => {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "RS256", kid: keyId })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(privateKeyObj);
};

export const verifyAccessToken = async (token) => {
  const header = decodeProtectedHeader(token);
  const tokenKid = header.kid;

  // No kid or matches current key — verify with current key
  if (!tokenKid || tokenKid === keyId) {
    const { payload } = await jwtVerify(token, publicKeyObj);
    return payload;
  }

  // Matches old key — verify with old key if available and not yet expired
  if (
    tokenKid === oldKeyId &&
    oldPublicKeyObj &&
    (!oldKeyExpiry || new Date() < oldKeyExpiry)
  ) {
    const { payload } = await jwtVerify(token, oldPublicKeyObj);
    return payload;
  }

  throw new Error("Token signed with unknown or revoked key");
};
