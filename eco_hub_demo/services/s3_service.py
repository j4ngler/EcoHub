"""
S3 Service - Quan ly upload va list video tu S3-compatible storage
"""
import os
import sys
import boto3
from botocore.config import Config
from boto3.s3.transfer import TransferConfig
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass

# Timezone GMT+7 (Vietnam)
GMT7 = timezone(timedelta(hours=7))

# Fix UTF-8 encoding for Windows console
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except:
        pass


@dataclass
class S3Config:
    """Cấu hình S3"""
    endpoint: str
    access_key: str
    secret_key: str
    bucket: str
    region: str = "hn-2"
    prefix: str = ""  # Tên nhân viên cho tên file (vd: "nguyen-van-a", "nva")


@dataclass
class S3VideoInfo:
    """Thông tin video trên S3"""
    key: str
    size_bytes: int
    last_modified: datetime
    url: Optional[str] = None


class S3Service:
    """Service để upload và quản lý video trên S3"""
    
    def __init__(self, config: Optional[S3Config] = None):
        self.config = config
        self._client = None
        
    def is_configured(self) -> bool:
        """Kiểm tra xem S3 đã được cấu hình chưa"""
        if not self.config:
            return False
        return all([
            self.config.endpoint,
            self.config.access_key,
            self.config.secret_key,
            self.config.bucket,
        ])
    
    def _get_client(self):
        """Tạo S3 client (lazy init)"""
        if not self.is_configured():
            raise ValueError("S3 chưa được cấu hình")
        
        if self._client is None:
            # Xóa proxy settings
            for k in ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"]:
                os.environ.pop(k, None)
            
            cfg = Config(
                signature_version="s3v4",
                request_checksum_calculation="when_required",
                response_checksum_validation="when_required",
                s3={
                    "addressing_style": "path",
                    "payload_signing_enabled": False,
                },
                proxies={},
            )
            
            self._client = boto3.client(
                "s3",
                endpoint_url=self.config.endpoint,
                region_name=self.config.region,
                aws_access_key_id=self.config.access_key,
                aws_secret_access_key=self.config.secret_key,
                config=cfg,
            )
        
        return self._client
    
    def upload_video(self, local_path: str, order_code: str) -> Tuple[bool, str]:
        """
        Upload video lên S3
        
        Args:
            local_path: Đường dẫn file local
            order_code: Mã đơn hàng (đã được sanitize)
        
        Returns:
            (success, message/key)
        """
        if not self.is_configured():
            return False, "S3 chưa được cấu hình"
        
        if not os.path.exists(local_path):
            return False, f"File không tồn tại: {local_path}"
        
        try:
            # Tạo tên file trên S3: {prefix}_{order_code}_{timestamp}.mp4
            filename = os.path.basename(local_path)
            timestamp = datetime.now(GMT7).strftime("%Y%m%d_%H%M%S")  # GMT+7
            
            if self.config.prefix:
                s3_key = f"{self.config.prefix}_{order_code}_{timestamp}.mp4"
            else:
                s3_key = f"{order_code}_{timestamp}.mp4"
            
            # Upload với TransferConfig tối ưu
            transfer_config = TransferConfig(
                multipart_threshold=5 * 1024 * 1024,  # 5MB
                multipart_chunksize=5 * 1024 * 1024,
                max_concurrency=1,
                use_threads=False,
            )
            
            client = self._get_client()
            client.upload_file(
                local_path,
                self.config.bucket,
                s3_key,
                Config=transfer_config,
            )
            
            print(f"[S3] Upload success: {s3_key}")
            return True, s3_key
            
        except Exception as e:
            error_msg = f"Error upload S3: {str(e)}"
            print(f"[S3 ERROR] {error_msg}")
            return False, error_msg
    
    def list_videos(self, limit: int = 1000) -> List[S3VideoInfo]:
        """
        Liệt kê video trên S3 (mới nhất trước)
        
        Args:
            limit: Số lượng tối đa
        
        Returns:
            Danh sách S3VideoInfo
        """
        if not self.is_configured():
            return []
        
        try:
            client = self._get_client()
            paginator = client.get_paginator("list_objects_v2")
            
            videos = []
            for page in paginator.paginate(Bucket=self.config.bucket):
                for obj in page.get("Contents", []):
                    key = obj["Key"]
                    
                    # Chỉ lấy file .mp4
                    if not key.lower().endswith(".mp4"):
                        continue
                    
                    size = int(obj["Size"])
                    last_modified = obj["LastModified"].astimezone(GMT7)  # Convert to GMT+7
                    
                    videos.append(S3VideoInfo(
                        key=key,
                        size_bytes=size,
                        last_modified=last_modified,
                    ))
                    
                    if len(videos) >= limit:
                        break
                
                if len(videos) >= limit:
                    break
            
            # Sắp xếp theo thời gian (mới nhất trước)
            videos.sort(key=lambda v: v.last_modified, reverse=True)
            
            return videos
            
        except Exception as e:
            print(f"[S3 ERROR] Error list videos: {e}")
            return []
    
    def get_total_size(self) -> int:
        """Tính tổng dung lượng video trên S3 (bytes)"""
        if not self.is_configured():
            return 0
        
        try:
            client = self._get_client()
            paginator = client.get_paginator("list_objects_v2")
            
            total = 0
            for page in paginator.paginate(Bucket=self.config.bucket):
                for obj in page.get("Contents", []):
                    if obj["Key"].lower().endswith(".mp4"):
                        total += int(obj["Size"])
            
            return total
            
        except Exception as e:
            print(f"[S3 ERROR] Error calculating total size: {e}")
            return 0
    
    def delete_video(self, key: str) -> Tuple[bool, str]:
        """
        Delete video from S3
        
        Args:
            key: S3 key of video
        
        Returns:
            (success, message)
        """
        if not self.is_configured():
            return False, "S3 not configured"
        
        try:
            client = self._get_client()
            client.delete_object(Bucket=self.config.bucket, Key=key)
            print(f"[S3] Deleted: {key}")
            return True, "Video deleted"
            
        except Exception as e:
            # Safe error handling for Unicode characters
            try:
                error_str = str(e)
            except:
                error_str = repr(e)
            error_msg = f"Error delete S3: {error_str}"
            print(f"[S3 ERROR] {error_msg}")
            return False, error_msg
    
    def generate_presigned_url(self, key: str, expiration: int = 3600) -> Optional[str]:
        """
        Tạo presigned URL để download video
        
        Args:
            key: S3 key
            expiration: Thời gian hết hạn (giây), mặc định 1 giờ
        
        Returns:
            URL hoặc None nếu lỗi
        """
        if not self.is_configured():
            return None
        
        try:
            client = self._get_client()
            url = client.generate_presigned_url(
                'get_object',
                Params={'Bucket': self.config.bucket, 'Key': key},
                ExpiresIn=expiration
            )
            return url
            
        except Exception as e:
            print(f"[S3 ERROR] Error generating presigned URL: {e}")
            return None
    
    def test_connection(self) -> Tuple[bool, str]:
        """
        Test kết nối S3
        
        Returns:
            (success, message)
        """
        if not self.is_configured():
            return False, "S3 chưa được cấu hình"
        
        try:
            client = self._get_client()
            # Thử list bucket
            client.head_bucket(Bucket=self.config.bucket)
            return True, "Kết nối S3 thành công"
            
        except Exception as e:
            return False, f"Lỗi kết nối S3: {str(e)}"


def bytes_to_human(n: int) -> str:
    """Chuyển bytes sang dạng human-readable"""
    units = ["B", "KB", "MB", "GB", "TB"]
    x = float(n)
    for u in units:
        if x < 1024 or u == units[-1]:
            return f"{x:.2f} {u}" if u != "B" else f"{int(x)} {u}"
        x /= 1024
    return f"{x:.2f} TB"
