import uuid
import hashlib

def get_device_id():
    with open("/etc/machine-id", "r") as f:
        machine_id = f.read().strip()

    return hashlib.sha256(
        machine_id.encode()
    ).hexdigest()

if __name__ =="__main__":
    print(get_device_id())
