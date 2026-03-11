import { importPKCS8, importSPKI, jwtVerify, SignJWT } from "jose"
import { privateKey, publicKey } from "./env.js"

const privateKeyObj = await importPKCS8(privateKey, "RS256")
const publicKeyObj = await importSPKI(publicKey, "RS256")

export const signAccessToken = async (payload) => {
    return new SignJWT(payload)
        .setProtectedHeader({ alg: "RS256" })
        .setIssuedAt()
        .setExpirationTime("15m")
        .sign(privateKeyObj)
}

export const verifyAccessToken = async (token) => {
    const { payload } = await jwtVerify(token, publicKeyObj)
    return payload
}