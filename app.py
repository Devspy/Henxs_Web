import os
import time

from flask import Flask, Response, render_template

import cv2

app = Flask(__name__)
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

@app.route('/')     
def home():
    return render_template('index.html', camera_stream_available=bool(RTSP_URL))


@app.route('/video_feed')
def video_feed():
    if not RTSP_URL:
        return 'RTSP_URL is not configured', 503

    return Response(
        generate_frames(),
        mimetype='multipart/x-mixed-replace; boundary=frame'
    )

@app.route('/contact')
def contact():
    return render_template('contact.html')

if __name__ == '__main__':
    app.run(debug=True)