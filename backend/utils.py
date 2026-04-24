import hashlib


def hash_password(texto: str) -> str:
    return hashlib.sha256(texto.encode()).hexdigest()
