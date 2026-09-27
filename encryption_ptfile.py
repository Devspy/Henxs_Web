from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import os

INPUT_FILE = "potholes.pt"
OUTPUT_FILE = "support.enc"

# Generate a 256-bit key
key = AESGCM.generate_key(bit_length=256)

with open(INPUT_FILE, "rb") as f:
    model_data = f.read()

aes = AESGCM(key)

# 12-byte random nonce
nonce = os.urandom(12)

encrypted_data = aes.encrypt(
    nonce,
    model_data,
    None
)

with open(OUTPUT_FILE, "wb") as f:
    f.write(nonce + encrypted_data)

print("Encrypted model:", OUTPUT_FILE)
print("KEY:")
print(key.hex())
