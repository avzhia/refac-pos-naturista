from pydantic import BaseModel
from typing import Optional


class AdminSetup(BaseModel):
    password: str
    confirm: str


class AdminLogin(BaseModel):
    password: str


class CajeroPinUpdate(BaseModel):
    pin: str


class ConfigIn(BaseModel):
    clave: str
    valor: str
