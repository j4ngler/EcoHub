import crypto from 'crypto';

export function decryptFernet(tokenBase64Url: string, keyBase64Url: string): string {
  if (!tokenBase64Url) return '';
  try {
    const decodedTokenBuffer = Buffer.from(tokenBase64Url, 'base64url');
    const tokenString = decodedTokenBuffer.toString('utf8');
    const tokenBytes = Buffer.from(tokenString, 'base64url');
    
    if (tokenBytes[0] !== 0x80) {
      throw new Error('Invalid Fernet version');
    }
    
    const keyBytes = Buffer.from(keyBase64Url, 'base64url');
    if (keyBytes.length !== 32) {
      throw new Error('Invalid key length: must be 32 bytes');
    }
    
    const signingKey = keyBytes.subarray(0, 16);
    const encryptionKey = keyBytes.subarray(16, 32);
    
    const timestamp = tokenBytes.subarray(1, 9);
    const iv = tokenBytes.subarray(9, 25);
    const ciphertext = tokenBytes.subarray(25, tokenBytes.length - 32);
    const hmacReceived = tokenBytes.subarray(tokenBytes.length - 32);
    
    const hmacInput = Buffer.concat([tokenBytes.subarray(0, 1), timestamp, iv, ciphertext]);
    const hmacCalculated = crypto.createHmac('sha256', signingKey).update(hmacInput).digest();
    
    if (!crypto.timingSafeEqual(hmacReceived, hmacCalculated)) {
      throw new Error('HMAC verification failed');
    }
    
    const decipher = crypto.createDecipheriv('aes-128-cbc', encryptionKey, iv);
    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    console.error('[Fernet Decrypt Error]', error);
    return '';
  }
}

export function encryptFernet(plaintext: string, keyBase64Url: string): string {
  if (!plaintext) return '';
  try {
    const keyBytes = Buffer.from(keyBase64Url, 'base64url');
    if (keyBytes.length !== 32) {
      throw new Error('Invalid key length: must be 32 bytes');
    }
    const signingKey = keyBytes.subarray(0, 16);
    const encryptionKey = keyBytes.subarray(16, 32);
    
    const version = Buffer.from([0x80]);
    const timestamp = Buffer.alloc(8);
    const seconds = Math.floor(Date.now() / 1000);
    timestamp.writeBigUInt64BE(BigInt(seconds));
    
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv('aes-128-cbc', encryptionKey, iv);
    let ciphertext = cipher.update(Buffer.from(plaintext, 'utf8'));
    ciphertext = Buffer.concat([ciphertext, cipher.final()]);
    
    const hmacInput = Buffer.concat([version, timestamp, iv, ciphertext]);
    const hmac = crypto.createHmac('sha256', signingKey).update(hmacInput).digest();
    
    const rawFernetBytes = Buffer.concat([version, timestamp, iv, ciphertext, hmac]);
    const fernetTokenBase64Url = rawFernetBytes.toString('base64url');
    
    return Buffer.from(fernetTokenBase64Url, 'utf8').toString('base64url');
  } catch (error) {
    console.error('[Fernet Encrypt Error]', error);
    return '';
  }
}
