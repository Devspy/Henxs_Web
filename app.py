from flask import Flask, render_template, jsonify, request

app = Flask(__name__)

TASKS = [
    {"id":"TK-2026-1084","module":"Pothole","issue":"PH-2026-1045","location":"Chandrasekharpur","zone":"North Zone","status":"Pending","assigned":"R. Das","due":"14 Oct 2026","created":"13 Oct 2026, 10:24 AM","remarks":"Inspection and repair required. Large pothole near signal.","score":"0.92"},
    {"id":"TK-2026-1083","module":"Garbage","issue":"GB-2026-1054","location":"Patia Main Road","zone":"East Zone","status":"In Progress","assigned":"S. Mohanty","due":"14 Oct 2026","created":"13 Oct 2026, 09:40 AM","remarks":"Garbage collection and cleanup required.","score":"0.88"},
    {"id":"TK-2026-1082","module":"Pothole","issue":"PH-2026-1048","location":"KIIT Road","zone":"South Zone","status":"In Progress","assigned":"P. Behera","due":"13 Oct 2026","created":"12 Oct 2026, 04:15 PM","remarks":"Road surface damage reported by inspection team.","score":"0.91"},
    {"id":"TK-2026-1081","module":"Garbage","issue":"GB-2026-1053","location":"Rasulgarh Square","zone":"West Zone","status":"Completed","assigned":"K. Sahu","due":"12 Oct 2026","created":"11 Oct 2026, 11:05 AM","remarks":"Area cleaned and verified by supervisor.","score":"0.86"},
    {"id":"TK-2026-1080","module":"Pothole","issue":"PH-2026-1047","location":"Khandagiri Junction","zone":"South Zone","status":"Pending","assigned":"M. Pattnaik","due":"15 Oct 2026","created":"13 Oct 2026, 08:20 AM","remarks":"Pothole requires inspection and repair.","score":"0.89"},
    {"id":"TK-2026-1079","module":"Garbage","issue":"GB-2026-1052","location":"Nandankanan Road","zone":"North Zone","status":"In Progress","assigned":"A. Pradhan","due":"13 Oct 2026","created":"12 Oct 2026, 01:10 PM","remarks":"Collection vehicle assigned; cleanup underway.","score":"0.90"},
    {"id":"TK-2026-1078","module":"Garbage","issue":"GB-2026-1050","location":"Jayadev Vihar","zone":"East Zone","status":"Pending","assigned":"R. Das","due":"14 Oct 2026","created":"13 Oct 2026, 09:12 AM","remarks":"Waste accumulation reported near junction.","score":"0.87"},
    {"id":"TK-2026-1077","module":"Pothole","issue":"PH-2026-1046","location":"Power House Road","zone":"West Zone","status":"Completed","assigned":"S. Mohanty","due":"11 Oct 2026","created":"10 Oct 2026, 03:45 PM","remarks":"Repair completed; awaiting final audit.","score":"0.93"},
    {"id":"TK-2026-1076","module":"Garbage","issue":"GB-2026-1049","location":"Airport Road","zone":"South Zone","status":"Pending","assigned":"P. Behera","due":"15 Oct 2026","created":"13 Oct 2026, 11:25 AM","remarks":"Waste pickup required along roadside.","score":"0.85"},
    {"id":"TK-2026-1075","module":"Pothole","issue":"PH-2026-1044","location":"Infocity Road","zone":"East Zone","status":"In Progress","assigned":"K. Sahu","due":"13 Oct 2026","created":"12 Oct 2026, 02:30 PM","remarks":"Repair crew has been notified.","score":"0.90"},
]
@app.route("/")
def index():
    return render_template("index.html", tasks=TASKS)

@app.route("/dashboard")
def dashboard():
    return render_template("dashboard.html")

@app.route("/login")
def login():
    return render_template("login.html")

@app.route("/historic-events")
def historic_events():
    return render_template("historic_events.html")

@app.route("/pothole-detection")
def pothole_detection():
    return render_template("pothole_detection.html")

@app.route("/analytics")
def analytics():
    return render_template("analytics.html")

@app.route("/garbage-detection")
def garbage_detection():
    return render_template("garbage_detection.html")

@app.route("/api/tasks", methods=["GET"])
def api_tasks():
    status = request.args.get("status", "All Tasks")
    query = request.args.get("q", "").strip().lower()
    zone = request.args.get("zone", "All Zones")
    module = request.args.get("module", "All Modules")
    tasks = TASKS
    if status != "All Tasks":
        tasks = [t for t in tasks if t["status"] == status]
    if query:
        tasks = [t for t in tasks if query in " ".join(str(v) for v in t.values()).lower()]
    if zone != "All Zones":
        tasks = [t for t in tasks if t["zone"] == zone]
    if module != "All Modules":
        tasks = [t for t in tasks if t["module"] == module]
    return jsonify(tasks)

@app.route("/api/tasks/<task_id>", methods=["PATCH"])
def update_task(task_id):
    data = request.get_json(silent=True) or {}
    task = next((t for t in TASKS if t["id"] == task_id), None)
    if not task:
        return jsonify({"error": "Task not found"}), 404
    if data.get("status") in {"Pending", "In Progress", "Completed", "Overdue"}:
        task["status"] = data["status"]
    if "assigned" in data:
        task["assigned"] = str(data["assigned"])[:100]
    return jsonify(task)

if __name__ == "__main__":
    app.run(debug=True)
