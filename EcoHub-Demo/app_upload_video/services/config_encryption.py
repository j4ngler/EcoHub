"""
Config Encryption - Mã hóa credentials nhạy cảm
"""
import base64
import os
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from typing import Optional


class ConfigEncryption:
    """Mã hóa/giải mã config nhạy cảm"""
    
    def __init__(self, key_file: str = "config.key"):
        self.key_file = key_file
        self._fernet = None
    
    def _get_or_create_key(self) -> bytes:
        """Lấy hoặc tạo encryption key"""
        if os.path.exists(self.key_file):
            with open(self.key_file, "rb") as f:
                return f.read()
        else:
            # Tạo key mới từ machine-specific salt
            import platform
            import hashlib
            
            # Sử dụng thông tin máy để tạo salt (đơn giản)
            machine_info = f"{platform.node()}{platform.machine()}{platform.system()}"
            salt = hashlib.sha256(machine_info.encode()).digest()[:16]
            
            # Tạo password từ UUID ngẫu nhiên
            import uuid
            password = str(uuid.uuid4()).encode()
            
            # Derive key từ password + salt
            kdf = PBKDF2HMAC(
                algorithm=hashes.SHA256(),
                length=32,
                salt=salt,
                iterations=100000,
            )
            key = base64.urlsafe_b64encode(kdf.derive(password))
            
            # Lưu key
            with open(self.key_file, "wb") as f:
                f.write(key)
            
            print(f"[ENCRYPTION] Đã tạo key mới: {self.key_file}")
            return key
    
    def _get_fernet(self) -> Fernet:
        """Lấy Fernet cipher"""
        if self._fernet is None:
            key = self._get_or_create_key()
            self._fernet = Fernet(key)
        return self._fernet
    
    def encrypt(self, plaintext: str) -> str:
        """
        Mã hóa chuỗi
        
        Args:
            plaintext: Chuỗi gốc
        
        Returns:
            Chuỗi đã mã hóa (base64)
        """
        if not plaintext:
            return ""
        
        try:
            fernet = self._get_fernet()
            encrypted = fernet.encrypt(plaintext.encode())
            return base64.urlsafe_b64encode(encrypted).decode()
        except Exception as e:
            print(f"[ENCRYPTION ERROR] Lỗi mã hóa: {e}")
            return ""
    
    def decrypt(self, encrypted: str) -> str:
        """
        Giải mã chuỗi
        
        Args:
            encrypted: Chuỗi đã mã hóa
        
        Returns:
            Chuỗi gốc
        """
        if not encrypted:
            return ""
        
        try:
            fernet = self._get_fernet()
            decoded = base64.urlsafe_b64decode(encrypted.encode())
            decrypted = fernet.decrypt(decoded)
            return decrypted.decode()
        except Exception as e:
            print(f"[ENCRYPTION ERROR] Lỗi giải mã: {e}")
            return ""


# Singleton instance
_encryptor: Optional[ConfigEncryption] = None


def get_encryptor(key_file: str = "config.key") -> ConfigEncryption:
    """Lấy singleton encryptor"""
    global _encryptor
    if _encryptor is None:
        _encryptor = ConfigEncryption(key_file)
    return _encryptor
