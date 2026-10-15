"""Small protocol helpers; no credentials or customer details are logged."""
import hashlib
import hmac
import json
import secrets
import time


def make_ticket(call_sid: str, secret: str, now: int | None = None) -> str:
    issued = int(time.time()) if now is None else now
    payload = f"{call_sid}.{issued}.{secrets.token_hex(16)}"
    return f"{payload}.{hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()}"


def valid_ticket(ticket: str, call_sid: str, secret: str, now: int | None = None) -> bool:
    try:
        sid, issued, nonce, signature = ticket.split('.')
        age = (int(time.time()) if now is None else now) - int(issued)
        payload = f"{sid}.{issued}.{nonce}"
        expected = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
        return sid == call_sid and 0 <= age <= 120 and len(nonce) == 32 and hmac.compare_digest(signature, expected)
    except (ValueError, TypeError):
        return False


def signed_event(event: dict, secret: str) -> tuple[bytes, dict]:
    body = json.dumps(event, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()
    timestamp = str(int(time.time()))
    signature = hmac.new(secret.encode(), timestamp.encode() + b'.' + body, hashlib.sha256).hexdigest()
    return body, {'Content-Type': 'application/json', 'X-Schurr-Timestamp': timestamp, 'X-Schurr-Signature': signature}
