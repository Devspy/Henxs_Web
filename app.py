import os
import sqlite3
import time

from functools import wraps

from flask import Flask, Response, redirect, render_template, request, session, url_for

import cv2

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'cameras.db')

app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', 'henux-development-secret')


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db_connection()
    conn.execute('''
        CREATE TABLE IF NOT EXISTS cameras (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            rtsp_url TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()


def get_cameras():
    conn = get_db_connection()
    rows = conn.execute(
        'SELECT * FROM cameras ORDER BY created_at DESC'
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_camera_by_id(camera_id):
    conn = get_db_connection()
    row = conn.execute('SELECT * FROM cameras WHERE id = ?', (camera_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def get_primary_camera():
    cameras = get_cameras()
    return cameras[0] if cameras else None


def add_camera_record(name, rtsp_url):
    conn = get_db_connection()
    cursor = conn.execute(
        'INSERT INTO cameras (name, rtsp_url) VALUES (?, ?)',
        (name, rtsp_url)
    )
    conn.commit()
    added_id = cursor.lastrowid
    conn.close()
    return added_id


def update_camera_record(camera_id, name, rtsp_url):
    conn = get_db_connection()
    conn.execute(
        'UPDATE cameras SET name = ?, rtsp_url = ? WHERE id = ?',
        (name, rtsp_url, camera_id)
    )
    conn.commit()
    conn.close()


def delete_camera_record(camera_id):
    conn = get_db_connection()
    conn.execute('DELETE FROM cameras WHERE id = ?', (camera_id,))
    conn.commit()
    conn.close()


def generate_frames(rtsp_url):
    camera = cv2.VideoCapture(rtsp_url)

    try:
        while True:
            success, frame = camera.read()

            if not success:
                time.sleep(1)
                camera.release()
                camera = cv2.VideoCapture(rtsp_url)
                continue

            success, buffer = cv2.imencode('.jpg', frame)

            if success:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' +
                       buffer.tobytes() + b'\r\n')
    finally:
        camera.release()


def login_required(view):
    @wraps(view)
    def wrapped_view(*args, **kwargs):
        if not session.get('logged_in'):
            return redirect(url_for('login'))
        return view(*args, **kwargs)

    return wrapped_view


@app.route('/login', methods=['GET', 'POST'])
def login():
    if session.get('logged_in'):
        return redirect(url_for('home'))

    error = None
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')

        if username == 'admin' and password == 'admin':
            session['logged_in'] = True
            return redirect(url_for('home'))

        error = 'Invalid login ID or password.'

    return render_template('login.html', error=error)

@app.route('/')     
@login_required
def home():
    cameras = get_cameras()
    primary_camera = get_primary_camera()
    return render_template(
        'index.html',
        cameras=cameras,
        primary_camera=primary_camera,
        camera_stream_available=bool(primary_camera or cameras)
    )


@app.route('/add-camera', methods=['GET', 'POST'])
@login_required
def add_camera():
    error = None
    success = None

    if request.method == 'POST':
        camera_name = request.form.get('camera_name', '').strip()
        rtsp_url = request.form.get('rtsp_url', '').strip()

        if not camera_name or not rtsp_url:
            error = 'Camera name and RTSP link are required.'
        else:
            added_id = add_camera_record(camera_name, rtsp_url)
            success = 'Camera saved successfully.'
            return redirect(url_for('camera_detail', camera_id=added_id))

    return render_template('add_camera.html', error=error, success=success)


@app.route('/camera-view')
@login_required
def camera_overview():
    cameras = get_cameras()
    return render_template(
        'camera_view.html',
        cameras=cameras,
        camera_stream_available=bool(cameras),
        camera_status='Offline' if not cameras else 'Live'
    )


@app.route('/camera-view/<int:camera_id>')
@login_required
def camera_detail(camera_id):
    camera = get_camera_by_id(camera_id)
    if camera is None:
        return redirect(url_for('camera_overview'))

    return render_template(
        'camera_view.html',
        cameras=[camera],
        camera=camera,
        camera_stream_available=bool(camera.get('rtsp_url')),
        camera_status='Live'
    )


@app.route('/settings', methods=['GET', 'POST'])
@login_required
def settings_page():
    cameras = get_cameras()
    message = None
    error = None

    if request.method == 'POST':
        action = request.form.get('action')

        if action == 'delete':
            camera_id = request.form.get('camera_id', type=int)
            if camera_id:
                delete_camera_record(camera_id)
                message = 'Camera deleted successfully.'
            else:
                error = 'Camera ID is required.'
        elif action == 'edit':
            camera_id = request.form.get('camera_id', type=int)
            camera_name = request.form.get('camera_name', '').strip()
            rtsp_url = request.form.get('rtsp_url', '').strip()
            if camera_id and camera_name and rtsp_url:
                update_camera_record(camera_id, camera_name, rtsp_url)
                message = 'Camera updated successfully.'
            else:
                error = 'Camera name and RTSP link are required.'
        else:
            camera_name = request.form.get('camera_name', '').strip()
            rtsp_url = request.form.get('rtsp_url', '').strip()
            if camera_name and rtsp_url:
                add_camera_record(camera_name, rtsp_url)
                message = 'Camera added successfully.'
            else:
                error = 'Camera name and RTSP link are required.'

        cameras = get_cameras()

    return render_template('settings.html', cameras=cameras, message=message, error=error)


@app.route('/video_feed')
@login_required
def video_feed():
    camera_id = request.args.get('camera_id', type=int)

    if camera_id:
        camera = get_camera_by_id(camera_id)
        if camera is None or not camera.get('rtsp_url'):
            return 'Camera not found', 404
        rtsp_url = camera['rtsp_url']
    else:
        primary_camera = get_primary_camera()
        if primary_camera:
            rtsp_url = primary_camera.get('rtsp_url', '')
        else:
            return 'No camera is configured', 503

    if not rtsp_url:
        return 'No camera is configured', 503

    return Response(
        generate_frames(rtsp_url),
        mimetype='multipart/x-mixed-replace; boundary=frame'
    )


@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

@app.route('/events')
@login_required
def events_page():
    events = [
        {
            'type': 'ALPR',
            'title': 'KA 12 AB 3456',
            'camera': 'Main Gate',
            'time': '2026-08-30 08:42:14',
            'status': 'Authorized',
            'status_class': 'success'
        },
        {
            'type': 'ALPR',
            'title': 'TN 08 CD 7281',
            'camera': 'Parking Exit',
            'time': '2026-08-30 08:39:08',
            'status': 'Visitor',
            'status_class': 'warning'
        },
        {
            'type': 'Face Recognition',
            'title': 'John Smith',
            'camera': 'Lobby Entry',
            'time': '2026-08-30 08:33:45',
            'status': 'Matched',
            'status_class': 'success'
        },
        {
            'type': 'Face Recognition',
            'title': 'Unknown Person',
            'camera': 'Rear Door',
            'time': '2026-08-30 08:27:12',
            'status': 'Alert',
            'status_class': 'danger'
        }
    ]
    return render_template('events.html', events=events)


@app.route('/contact')
def contact():
    return render_template('contact.html')


init_db()

if __name__ == '__main__':
    app.run(
        host='0.0.0.0',
        port=int(os.getenv('PORT', '5000')),
        debug=True
    )