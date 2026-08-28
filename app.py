import os
import time

from functools import wraps

from flask import Flask, Response, redirect, render_template, request, session, url_for

import cv2

app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', 'henux-development-secret')
RTSP_URL = os.getenv(
    'RTSP_URL',
    'rtsp://admin:MyOditek123%40@10.30.30.51/1'
).strip()


def generate_frames():
    camera = cv2.VideoCapture(RTSP_URL)

    try:
        while True:
            success, frame = camera.read()

            if not success:
                time.sleep(1)
                camera.release()
                camera = cv2.VideoCapture(RTSP_URL)
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
    return render_template('index.html', camera_stream_available=bool(RTSP_URL))


@app.route('/video_feed')
@login_required
def video_feed():
    if not RTSP_URL:
        return 'RTSP_URL is not configured', 503

    return Response(
        generate_frames(),
        mimetype='multipart/x-mixed-replace; boundary=frame'
    )


@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

@app.route('/contact')
def contact():
    return render_template('contact.html')

if __name__ == '__main__':
    app.run(debug=True)