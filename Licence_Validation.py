import json
import base64
from datetime import datetime, timezone
import hashlib

from cryptography.hazmat.primitives import serialization


LICENSE_FILE = "license.json"
PUBLIC_KEY_FILE = "public_key.pem"

def get_device_id():
    with open("/etc/machine-id", "r") as f:
        machine_id = f.read().strip()

    return hashlib.sha256(
        machine_id.encode()
    ).hexdigest()


# def get_device_id():
#     import uuid
#     import hashlib

#     raw = str(uuid.getnode()).encode()
#     return hashlib.sha256(raw).hexdigest()


def load_public_key():
    with open(PUBLIC_KEY_FILE, "rb") as f:
        return serialization.load_pem_public_key(f.read())


def verify_license():
    # Load license
    with open(LICENSE_FILE, "r") as f:
        license_file = json.load(f)

    payload = base64.b64decode(license_file["payload"])
    signature = base64.b64decode(license_file["signature"])

    # Load public key
    public_key = load_public_key()

    # Verify cryptographic signature
    try:
        public_key.verify(signature, payload)
    except Exception:
        print("Invalid license signature.")
        return False

    # Read license data
    license_data = json.loads(payload.decode())

    # Check device
    current_device_id = get_device_id()

    if license_data["device_id"] != current_device_id:
        print("License is not valid for this device.")
        return False

    # Check expiration
    expires_at = datetime.fromisoformat(
        license_data["expires_at"]
    )

    if datetime.now(timezone.utc) > expires_at:
        print("License has expired.")
        return False

    print("License is valid.")
    print("Product:", license_data["product"])
    print("License ID:", license_data["license_id"])
    print("Features:", license_data["features"])

    return True
