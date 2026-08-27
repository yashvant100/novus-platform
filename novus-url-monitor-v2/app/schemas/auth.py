from pydantic import BaseModel, EmailStr, Field
class LoginRequest(BaseModel): email: EmailStr; password: str=Field(min_length=8,max_length=256)
class TokenResponse(BaseModel): access_token: str; token_type: str="bearer"
class RefreshRequest(BaseModel): refresh_token: str
class UserCreate(BaseModel): email: EmailStr; password: str=Field(min_length=12,max_length=256); role: str="VIEWER"
