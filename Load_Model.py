from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import tempfile
import os

MODEL_KEY = bytes.fromhex(
    "eb0bc28ce52ac1a6a55b348531ee85f7099311e60e1b5a11e91c254312bd141b"
)

def decrypt_model(encrypted_file):
    with open(encrypted_file, "rb") as f:
        encrypted_data = f.read()

    nonce = encrypted_data[:12]
    ciphertext = encrypted_data[12:]

    aes = AESGCM(MODEL_KEY)

    model_data = aes.decrypt(
        nonce,
        ciphertext,
        None
    )

    temp = tempfile.NamedTemporaryFile(
        suffix=".pt",
        delete=False
    )

    try:
        temp.write(model_data)
        temp.close()
        return temp.name
    except Exception:
        temp.close()
        os.unlink(temp.name)
        raise
