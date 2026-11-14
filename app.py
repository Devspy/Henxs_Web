import json
import os
from functools import wraps
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from flask import Flask, render_template, jsonify, request, redirect, session, url_for

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY") or "086572984a483fa35d308c32dbad584c9dd21cbc726a7f8a0a049cb4da7b55bc"
AUTH_LOGIN_URL = "https://api.henxs.tech/api/v1/auth/login"
AUTH_LOGOUT_URL = "https://api.henxs.tech/api/v1/auth/logout"
USERS_API_URL = "https://api.henxs.tech/api/v1/users"
EVENTS_API_URL = "https://api.henxs.tech/api/v1/events"


def login_required(view):
    @wraps(view)
    def wrapped_view(*args, **kwargs):
        if not session.get("authenticated"):
            if request.path.startswith("/api/"):
                return jsonify({"detail": "Authentication required."}), 401
            return redirect(url_for("index"))
        return view(*args, **kwargs)
    return wrapped_view

@app.route("/")
def index():
    return render_template("login.html")

@app.route("/dashboard")
@login_required
def dashboard():
    return render_template("dashboard.html")

@app.route("/tasks")
@login_required
def task_management():
    return render_template("index.html")

@app.route("/users")
@app.route("/user-management")
@login_required
def user_management():
    return render_template("users.html")

@app.route("/devices")
@app.route("/device-management")
@login_required
def device_management():
    return redirect(url_for("dashboard"))

@app.route("/settings")
@app.route("/setting-configuration")
@login_required
def settings():
    return redirect(url_for("dashboard"))

@app.route("/helpdesk")
@app.route("/help-desk")
@login_required
def helpdesk():
    return render_template("helpdesk.html")

@app.route("/login")
def login():
    return render_template("login.html")

@app.route("/api/auth/login", methods=["POST"])
def api_login():
    credentials = request.get_json(silent=True) or {}
    identifier = str(credentials.get("identifier", "")).strip()
    password = credentials.get("password", "")
    if not identifier or not isinstance(password, str) or not password:
        return jsonify({"detail": "ID and password are required."}), 400

    payload = json.dumps({"identifier": identifier, "password": password}).encode("utf-8")
    upstream_request = Request(
        AUTH_LOGIN_URL,
        data=payload,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urlopen(upstream_request, timeout=20) as response:
            result = json.loads(response.read().decode("utf-8"))
            if result.get("success") is True and result.get("access_token"):
                session["authenticated"] = True
                user = result.get("user") or {}
                roles = user.get("roles") if isinstance(user, dict) else None
                role = (
                    (user.get("role") or user.get("user_role") or user.get("userRole"))
                    if isinstance(user, dict)
                    else None
                ) or result.get("role") or (roles[0] if isinstance(roles, list) and roles else "")
                session["user_role"] = str(role).strip().lower().replace(" ", "_")
                if isinstance(user, dict):
                    session["user_id"] = str(user.get("id") or user.get("user_id") or user.get("userId") or user.get("_id") or result.get("user_id") or result.get("id") or "")
                    session["username"] = str(user.get("username") or user.get("user_name") or user.get("userName") or credentials.get("identifier") or "")
                    session["display_name"] = str(user.get("name") or user.get("full_name") or user.get("fullName") or result.get("name") or "")
            return jsonify(result), response.status
    except HTTPError as error:
        try:
            result = json.loads(error.read().decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            result = {"detail": "Login failed. Check your email and password."}
        return jsonify(result), error.code
    except (URLError, TimeoutError, json.JSONDecodeError):
        return jsonify({"detail": "Unable to reach the login service. Please try again."}), 502

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("index"))

@app.route("/api/auth/logout", methods=["POST"])
def api_logout():
    authorization = request.headers.get("Authorization", "")
    session.clear()
    if not authorization.startswith("Bearer "):
        return jsonify({"detail": "A bearer access token is required."}), 401

    upstream_request = Request(
        AUTH_LOGOUT_URL,
        headers={"Accept": "application/json", "Authorization": authorization},
        method="POST",
    )
    try:
        with urlopen(upstream_request, timeout=20) as response:
            body = response.read().decode("utf-8")
            try:
                result = json.loads(body)
            except json.JSONDecodeError:
                result = {"message": body or "Logged out successfully."}
            return jsonify(result), response.status
    except HTTPError as error:
        try:
            result = json.loads(error.read().decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            result = {"detail": "Logout request failed."}
        return jsonify(result), error.code
    except (URLError, TimeoutError):
        return jsonify({"detail": "Unable to reach the logout service."}), 502

@app.route("/historic-events")
@login_required
def historic_events():
    return render_template("historic_events.html")

@app.route("/pothole-detection")
@login_required
def pothole_detection():
    return render_template("pothole_detection.html")

@app.route("/manhole-detection")
@login_required
def manhole_detection():
    return render_template("manhole_detection.html")

@app.route("/analytics")
@login_required
def analytics():
    return render_template("analytics.html")

@app.route("/garbage-detection")
@login_required
def garbage_detection():
    return render_template("garbage_detection.html")

@app.route("/api/users", methods=["POST"])
@login_required
def create_user():
    authorization = request.headers.get("Authorization", "")
    if not authorization.startswith("Bearer "):
        return jsonify({"detail": "A bearer access token is required."}), 401

    payload = json.dumps(request.get_json(silent=True) or {}).encode("utf-8")
    upstream_request = Request(
        USERS_API_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": authorization,
        },
        method="POST",
    )
    try:
        with urlopen(upstream_request, timeout=20) as response:
            body = response.read().decode("utf-8")
            try:
                result = json.loads(body)
            except json.JSONDecodeError:
                result = {"message": body or "User created successfully."}
            return jsonify(result), response.status
    except HTTPError as error:
        try:
            result = json.loads(error.read().decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            result = {"detail": "User creation failed."}
        return jsonify(result), error.code
    except (URLError, TimeoutError):
        return jsonify({"detail": "Unable to reach the user service. Please try again."}), 502

@app.route("/api/users", methods=["GET"])
@login_required
def list_users():
    authorization = request.headers.get("Authorization", "")
    if not authorization.startswith("Bearer "):
        return jsonify({"detail": "A bearer access token is required."}), 401

    upstream_request = Request(
        USERS_API_URL,
        headers={"Accept": "application/json", "Authorization": authorization},
        method="GET",
    )
    try:
        with urlopen(upstream_request, timeout=20) as response:
            body = response.read().decode("utf-8")
            try:
                result = json.loads(body)
            except json.JSONDecodeError:
                return jsonify({"detail": "The user service returned an invalid response."}), 502
            return jsonify(result), response.status
    except HTTPError as error:
        try:
            result = json.loads(error.read().decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            result = {"detail": "Unable to load users."}
        return jsonify(result), error.code
    except (URLError, TimeoutError):
        return jsonify({"detail": "Unable to reach the user service. Please try again."}), 502

@app.route("/api/users/<user_id>", methods=["PUT", "PATCH"])
@login_required
def update_user(user_id):
    authorization = request.headers.get("Authorization", "")
    if not authorization.startswith("Bearer "):
        return jsonify({"detail": "A bearer access token is required."}), 401

    payload = json.dumps(request.get_json(silent=True) or {}).encode("utf-8")
    upstream_request = Request(
        f"{USERS_API_URL}/{user_id}",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": authorization,
        },
        method=request.method,
    )
    try:
        with urlopen(upstream_request, timeout=20) as response:
            body = response.read().decode("utf-8")
            try:
                result = json.loads(body) if body else {"message": "User updated successfully."}
            except json.JSONDecodeError:
                result = {"message": body or "User updated successfully."}
            return jsonify(result), response.status
    except HTTPError as error:
        try:
            result = json.loads(error.read().decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            result = {"detail": "User update failed."}
        return jsonify(result), error.code
    except (URLError, TimeoutError):
        return jsonify({"detail": "Unable to reach the user service. Please try again."}), 502


def proxy_events_api(url, method="GET", payload=None):
    headers = {"Accept": "application/json"}
    authorization = request.headers.get("Authorization", "")
    if authorization.startswith("Bearer "):
        headers["Authorization"] = authorization
    body = None
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    upstream_request = Request(url, data=body, headers=headers, method=method)
    try:
        with urlopen(upstream_request, timeout=30) as response:
            response_body = response.read()
            if not response_body:
                return jsonify({}), response.status
            try:
                result = json.loads(response_body.decode("utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError):
                return jsonify({"detail": "The event service returned an invalid response."}), 502
            return jsonify(result), response.status
    except HTTPError as error:
        try:
            result = json.loads(error.read().decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            result = {"detail": "Unable to load events."}
        return jsonify(result), error.code
    except (URLError, TimeoutError):
        return jsonify({"detail": "Unable to reach the event service. Please try again."}), 502


@app.route("/api/events", methods=["GET"])
@login_required
def list_events():
    try:
        page = max(1, int(request.args.get("page", "1")))
        page_size = min(100, max(1, int(request.args.get("page_size", "100"))))
    except ValueError:
        return jsonify({"detail": "page and page_size must be integers."}), 400
    return proxy_events_api(f"{EVENTS_API_URL}?page={page}&page_size={page_size}")


@app.route("/api/events/<event_id>", methods=["GET", "PATCH"])
@login_required
def get_event(event_id):
    if not event_id or "/" in event_id:
        return jsonify({"detail": "Invalid event ID."}), 400
    if request.method == "PATCH":
        authorization = request.headers.get("Authorization", "")
        if not authorization.startswith("Bearer "):
            return jsonify({"detail": "A bearer access token is required."}), 401
        if session.get("user_role") not in {"admin", "super_admin"} and not event_assigned_to_current_user(event_id, authorization):
            return jsonify({"detail": "You can update only events assigned to your account."}), 403
        return proxy_events_api(f"{EVENTS_API_URL}/{event_id}", "PATCH", request.get_json(silent=True) or {})
    return proxy_events_api(f"{EVENTS_API_URL}/{event_id}")


def event_assigned_to_current_user(event_id, authorization):
    upstream_request = Request(
        f"{EVENTS_API_URL}/{event_id}",
        headers={"Accept": "application/json", "Authorization": authorization},
        method="GET",
    )
    try:
        with urlopen(upstream_request, timeout=20) as response:
            event = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, UnicodeDecodeError):
        return False
    if isinstance(event, dict) and isinstance(event.get("data"), dict):
        event = event["data"]
    if not isinstance(event, dict):
        return False
    assigned = event.get("assigned_to") or event.get("assignee") or event.get("assigned")
    assigned_object = assigned if isinstance(assigned, dict) else {}
    assigned_names = {
        str(value).strip().casefold()
        for value in (
            event.get("assigned_to_name"), event.get("assigned_user_name"),
            event.get("assignee_name"), event.get("assigned_username"),
            assigned_object.get("name"), assigned_object.get("username"),
            assigned_object.get("user_name"), assigned_object.get("full_name"),
            assigned if isinstance(assigned, str) else None,
        )
        if value not in (None, "")
    }
    assigned_ids = {
        str(value).strip().casefold()
        for value in (
            event.get("assigned_to_id"), event.get("assigned_user_id"),
            assigned_object.get("id"), assigned_object.get("user_id"),
            assigned_object.get("userId"), assigned_object.get("_id"),
            assigned if isinstance(assigned, (str, int)) else None,
        )
        if value not in (None, "")
    }
    current_names = {str(session.get(key, "")).strip().casefold() for key in ("username", "display_name") if session.get(key)}
    current_ids = {str(session.get("user_id", "")).strip().casefold()} - {""}
    return bool(assigned_names & current_names or assigned_ids & (current_ids | current_names))


@app.route("/api/v1/events/<event_id>/assign", methods=["PATCH"])
@login_required
def assign_event(event_id):
    if not event_id or "/" in event_id:
        return jsonify({"detail": "Invalid event ID."}), 400
    if session.get("user_role") not in {"admin", "super_admin"}:
        return jsonify({"detail": "Only administrators can assign events."}), 403
    if not request.headers.get("Authorization", "").startswith("Bearer "):
        return jsonify({"detail": "A bearer access token is required."}), 401
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict) or not isinstance(payload.get("assigned_to"), str) or not payload["assigned_to"].strip():
        return jsonify({"detail": "assigned_to must be a non-empty string."}), 400
    return proxy_events_api(f"{EVENTS_API_URL}/{event_id}/assign", "PATCH", {"assigned_to": payload["assigned_to"]})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8001, debug=True)
