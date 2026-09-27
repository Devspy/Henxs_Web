import os

# ============================================================
# IMPORTANT:
# Set FFmpeg RTSP options BEFORE importing/using OpenCV.
# TCP is generally more reliable than UDP for RTSP streams
# when packets are being lost/corrupted.
# ============================================================

os.environ.setdefault(
    "OPENCV_FFMPEG_CAPTURE_OPTIONS",
    "rtsp_transport;tcp"
)

import sqlite3
import threading
import time
import sys

from functools import wraps

from flask import (
    Flask,
    Response,
    redirect,
    render_template,
    request,
    session,
    url_for
)

import torch
import cv2
import numpy as np

from Licence_Validation import verify_license
from Load_Model import decrypt_model


# ============================================================
# YOLO
# ============================================================

try:
    from ultralytics import YOLO
except ImportError:
    YOLO = None


# ============================================================
# PATHS
# ============================================================

BASE_DIR = os.path.dirname(
    os.path.abspath(__file__)
)


def resource_path(relative_path):
    """
    Works both normally and when packaged using PyInstaller.
    """

    if getattr(sys, "frozen", False):

        base_path = sys._MEIPASS

    else:

        base_path = BASE_DIR

    return os.path.join(
        base_path,
        relative_path
    )


DB_PATH = os.path.join(
    BASE_DIR,
    "cameras.db"
)

MODEL_PATH = resource_path(
    "support.enc"
)


# ============================================================
# PERFORMANCE SETTINGS
# ============================================================

# Process every Nth frame.
#
# 1 = process every frame
# 2 = process every second frame
# 3 = process every third frame
#
# Start with 2 for low latency.
FRAME_SKIP = max(
    1,
    int(
        os.getenv(
            "FRAME_SKIP",
            "1"
        )
    )
)


# Resolution sent to browser.
STREAM_WIDTH = int(
    os.getenv(
        "STREAM_WIDTH",
        "854"
    )
)

STREAM_HEIGHT = int(
    os.getenv(
        "STREAM_HEIGHT",
        "480"
    )
)


# YOLO inference resolution.
#
# 640 is a good starting point.
YOLO_IMGSZ = int(
    os.getenv(
        "YOLO_IMGSZ",
        "640"
    )
)


# JPEG quality.
#
# 70-85 is generally good for live video.
JPEG_QUALITY = int(
    os.getenv(
        "JPEG_QUALITY",
        "80"
    )
)


# YOLO confidence.
YOLO_CONF = float(
    os.getenv(
        "YOLO_CONF",
        "0.50"
    )
)


# ============================================================
# FLASK
# ============================================================

app = Flask(__name__)

app.secret_key = os.getenv(
    "SECRET_KEY",
    "henux-development-secret"
)


# ============================================================
# DATABASE
# ============================================================

def get_db_connection():

    conn = sqlite3.connect(
        DB_PATH
    )

    conn.row_factory = sqlite3.Row

    return conn


def init_db():

    conn = get_db_connection()

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS cameras (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            rtsp_url TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    conn.commit()
    conn.close()


def get_cameras():

    conn = get_db_connection()

    rows = conn.execute(
        """
        SELECT *
        FROM cameras
        ORDER BY created_at DESC
        """
    ).fetchall()

    conn.close()

    return [
        dict(row)
        for row in rows
    ]


def get_camera_by_id(camera_id):

    conn = get_db_connection()

    row = conn.execute(
        """
        SELECT *
        FROM cameras
        WHERE id = ?
        """,
        (camera_id,)
    ).fetchone()

    conn.close()

    if row:

        return dict(row)

    return None


def get_primary_camera():

    cameras = get_cameras()

    if cameras:

        return cameras[0]

    return None


def get_camera_stats():

    cameras = get_cameras()

    total_cameras = len(
        cameras
    )

    active_cameras = sum(
        1
        for camera in cameras
        if str(
            camera.get(
                "rtsp_url",
                ""
            )
        ).strip()
    )

    return {
        "total": total_cameras,
        "active": active_cameras
    }


def add_camera_record(
    name,
    rtsp_url
):

    conn = get_db_connection()

    cursor = conn.execute(
        """
        INSERT INTO cameras
        (name, rtsp_url)
        VALUES (?, ?)
        """,
        (
            name,
            rtsp_url
        )
    )

    conn.commit()

    added_id = cursor.lastrowid

    conn.close()

    return added_id


def update_camera_record(
    camera_id,
    name,
    rtsp_url
):

    conn = get_db_connection()

    conn.execute(
        """
        UPDATE cameras
        SET name = ?,
            rtsp_url = ?
        WHERE id = ?
        """,
        (
            name,
            rtsp_url,
            camera_id
        )
    )

    conn.commit()
    conn.close()


def delete_camera_record(
    camera_id
):

    # Stop camera threads first.
    camera_streams.remove(
        camera_id
    )

    conn = get_db_connection()

    conn.execute(
        """
        DELETE FROM cameras
        WHERE id = ?
        """,
        (camera_id,)
    )

    conn.commit()
    conn.close()


# ============================================================
# NO SIGNAL IMAGE
# ============================================================

def create_no_signal_frame():

    frame = np.zeros(
        (
            STREAM_HEIGHT,
            STREAM_WIDTH,
            3
        ),
        dtype=np.uint8
    )

    frame[:] = (
        35,
        35,
        35
    )

    text = "NO SIGNAL"

    font = cv2.FONT_HERSHEY_SIMPLEX

    font_scale = 1.5

    thickness = 3

    (
        text_width,
        text_height
    ), baseline = cv2.getTextSize(
        text,
        font,
        font_scale,
        thickness
    )

    x = (
        STREAM_WIDTH -
        text_width
    ) // 2

    y = (
        STREAM_HEIGHT +
        text_height
    ) // 2

    cv2.putText(
        frame,
        text,
        (x, y),
        font,
        font_scale,
        (220, 220, 220),
        thickness,
        cv2.LINE_AA
    )

    success, buffer = cv2.imencode(
        ".jpg",
        frame,
        [
            cv2.IMWRITE_JPEG_QUALITY,
            JPEG_QUALITY
        ]
    )

    if success:

        return buffer.tobytes()

    return b""


# ============================================================
# YOLO DETECTOR
# ============================================================

class PotholeDetector:
    """
    Loads YOLO once.

    Inference is called by the CameraStream inference thread.
    """

    def __init__(
        self,
        model_path
    ):

        self.model = None

        self.model_path = (
            model_path
        )

        self.decrypted_model_path = (
            None
        )

        # Select GPU if available.
        if torch.cuda.is_available():

            self.device = "cuda:0"

        else:

            self.device = "cpu"


        # ----------------------------------------------------
        # Check Ultralytics
        # ----------------------------------------------------

        if YOLO is None:

            print(
                "Pothole detection disabled: "
                "Ultralytics is not installed."
            )

            return


        # ----------------------------------------------------
        # Check encrypted model
        # ----------------------------------------------------

        if not os.path.isfile(
            model_path
        ):

            print(
                f"Pothole model not found: "
                f"{model_path}"
            )

            return


        # ----------------------------------------------------
        # Load model
        # ----------------------------------------------------

        try:

            print(
                "Preparing pothole model..."
            )

            self.decrypted_model_path = (
                decrypt_model(
                    model_path
                )
            )

            print(
                "Loading YOLO model..."
            )

            self.model = YOLO(
                self.decrypted_model_path
            )

            self.model.to(
                self.device
            )


            if self.device.startswith(
                "cuda"
            ):

                try:

                    gpu_name = (
                        torch.cuda.get_device_name(
                            0
                        )
                    )

                except Exception:

                    gpu_name = (
                        "CUDA GPU"
                    )

                print(
                    "Pothole model running "
                    f"on CUDA: {gpu_name}"
                )

            else:

                print(
                    "CUDA unavailable. "
                    "Pothole model running "
                    "on CPU."
                )


            # ------------------------------------------------
            # Optional CUDA warmup
            # ------------------------------------------------

            if (
                self.device.startswith(
                    "cuda"
                )
            ):

                try:

                    dummy = np.zeros(
                        (
                            480,
                            854,
                            3
                        ),
                        dtype=np.uint8
                    )

                    print(
                        "Warming up YOLO..."
                    )

                    self.model.predict(
                        source=dummy,
                        imgsz=YOLO_IMGSZ,
                        conf=YOLO_CONF,
                        device=self.device,
                        verbose=False
                    )

                    print(
                        "YOLO warmup complete."
                    )

                except Exception as error:

                    print(
                        "YOLO warmup failed: "
                        f"{error}"
                    )


            print(
                "Pothole model loaded "
                "successfully."
            )


        except Exception as error:

            print(
                "Failed to load pothole "
                f"model: {error}"
            )

            self.model = None


            if (
                self.decrypted_model_path
                and
                os.path.exists(
                    self.decrypted_model_path
                )
            ):

                try:

                    os.remove(
                        self.decrypted_model_path
                    )

                except OSError:

                    pass


            self.decrypted_model_path = None


    # ========================================================
    # ANNOTATE
    # ========================================================

    def annotate(
        self,
        frame
    ):

        # If model isn't loaded,
        # return original frame.
        if self.model is None:

            return frame


        try:

            results = (
                self.model.predict(
                    source=frame,

                    imgsz=YOLO_IMGSZ,

                    conf=YOLO_CONF,

                    device=self.device,

                    verbose=False,

                    max_det=50
                )
            )


            if not results:

                return frame


            result = results[0]

            annotated_frame = (
                frame.copy()
            )


            if result.boxes is None:

                return annotated_frame


            # ------------------------------------------------
            # Draw detections
            # ------------------------------------------------

            for box in result.boxes:

                try:

                    x1, y1, x2, y2 = map(
                        int,
                        box.xyxy[
                            0
                        ].tolist()
                    )

                    class_id = int(
                        box.cls[0]
                    )

                    confidence = float(
                        box.conf[0]
                    )

                except Exception:

                    continue


                # Get class name safely.
                try:

                    if isinstance(
                        self.model.names,
                        dict
                    ):

                        class_name = (
                            self.model.names.get(
                                class_id,
                                str(
                                    class_id
                                )
                            )
                        )

                    else:

                        class_name = (
                            self.model.names[
                                class_id
                            ]
                        )

                except Exception:

                    class_name = str(
                        class_id
                    )


                label = (
                    f"{class_name} "
                    f"{confidence:.2f}"
                )


                # ------------------------------------------------
                # Bounding box
                # ------------------------------------------------

                cv2.rectangle(
                    annotated_frame,
                    (x1, y1),
                    (x2, y2),
                    (0, 255, 0),
                    2
                )


                # ------------------------------------------------
                # Label
                # ------------------------------------------------

                font = (
                    cv2.FONT_HERSHEY_SIMPLEX
                )

                font_scale = 0.6

                thickness = 2

                (
                    text_width,
                    text_height
                ), baseline = (
                    cv2.getTextSize(
                        label,
                        font,
                        font_scale,
                        thickness
                    )
                )


                label_y = y1 - 5


                if (
                    label_y
                    -
                    text_height
                    -
                    baseline
                    <
                    0
                ):

                    label_y = (
                        y1
                        +
                        text_height
                        +
                        baseline
                        +
                        5
                    )


                # Label background.
                cv2.rectangle(
                    annotated_frame,

                    (
                        x1,
                        label_y
                        -
                        text_height
                        -
                        baseline
                        -
                        5
                    ),

                    (
                        x1
                        +
                        text_width
                        +
                        5,
                        label_y
                    ),

                    (0, 255, 0),

                    -1
                )


                # Label text.
                cv2.putText(
                    annotated_frame,

                    label,

                    (
                        x1 + 2,
                        label_y - 5
                    ),

                    font,

                    font_scale,

                    (0, 0, 0),

                    thickness,

                    cv2.LINE_AA
                )


            return annotated_frame


        except Exception as error:

            print(
                "YOLO inference failed: "
                f"{error}"
            )

            # If YOLO fails, don't kill
            # the camera stream.
            return frame


# ============================================================
# CREATE ONE GLOBAL YOLO MODEL
# ============================================================

pothole_detector = (
    PotholeDetector(
        MODEL_PATH
    )
)


# ============================================================
# CAMERA STREAM
# ============================================================

class CameraStream:
    """
    Low-latency RTSP stream.

    Thread 1:
        Reads RTSP continuously.

    Thread 2:
        Runs YOLO on newest frame.

    Important:
        We DO NOT maintain a frame queue.

        Old frames are discarded.

        This keeps the browser close to live.
    """

    def __init__(
        self,
        rtsp_url
    ):

        self.rtsp_url = (
            rtsp_url
        )


        # ----------------------------------------------------
        # Stop signal
        # ----------------------------------------------------

        self.stop_event = (
            threading.Event()
        )


        # ----------------------------------------------------
        # Latest raw frame
        # ----------------------------------------------------

        self.raw_frame = None

        self.raw_lock = (
            threading.Lock()
        )


        # ----------------------------------------------------
        # Latest JPEG
        # ----------------------------------------------------

        self.latest_jpeg = (
            create_no_signal_frame()
        )

        self.jpeg_lock = (
            threading.Lock()
        )


        # ----------------------------------------------------
        # Statistics
        # ----------------------------------------------------

        self.frame_counter = 0

        self.last_error_time = 0


        # OpenCV camera object.
        self.camera = None


        # ----------------------------------------------------
        # Capture thread
        # ----------------------------------------------------

        self.capture_thread = (
            threading.Thread(
                target=self._capture_loop,
                daemon=True,
                name="RTSP-Capture"
            )
        )


        # ----------------------------------------------------
        # YOLO thread
        # ----------------------------------------------------

        self.inference_thread = (
            threading.Thread(
                target=self._inference_loop,
                daemon=True,
                name="YOLO-Inference"
            )
        )


        # Start both.
        self.capture_thread.start()

        self.inference_thread.start()


    # ========================================================
    # OPEN RTSP
    # ========================================================

    def _open_camera(self):

        print(
            "Opening RTSP camera:"
        )

        print(
            self.rtsp_url
        )


        camera = cv2.VideoCapture(
            self.rtsp_url,
            cv2.CAP_FFMPEG
        )


        # ----------------------------------------------------
        # Low-latency buffer
        # ----------------------------------------------------

        try:

            camera.set(
                cv2.CAP_PROP_BUFFERSIZE,
                1
            )

        except Exception:

            pass


        # ----------------------------------------------------
        # Check connection
        # ----------------------------------------------------

        if not camera.isOpened():

            print(
                "ERROR: Could not open "
                "RTSP stream."
            )

            camera.release()

            return None


        print(
            "RTSP camera connected."
        )


        return camera


    # ========================================================
    # CAPTURE THREAD
    # ========================================================

    def _capture_loop(self):

        while not self.stop_event.is_set():

            # ------------------------------------------------
            # Open camera
            # ------------------------------------------------

            self.camera = (
                self._open_camera()
            )


            if self.camera is None:

                self._set_no_signal()

                self.stop_event.wait(
                    2
                )

                continue


            failed_reads = 0


            try:

                while not self.stop_event.is_set():

                    # ----------------------------------------
                    # READ FRAME
                    # ----------------------------------------

                    success, frame = (
                        self.camera.read()
                    )


                    # IMPORTANT:
                    #
                    # Check success BEFORE
                    # touching/resizing frame.
                    # This fixes a bug in your
                    # original code.
                    # ----------------------------------------

                    if (
                        not success
                        or
                        frame is None
                    ):

                        failed_reads += 1


                        current_time = (
                            time.time()
                        )


                        # Don't print continuously.
                        if (
                            current_time
                            -
                            self.last_error_time
                            >
                            1
                        ):

                            print(
                                "RTSP frame "
                                "read failed "
                                f"({failed_reads})"
                            )

                            self.last_error_time = (
                                current_time
                            )


                        if failed_reads >= 10:

                            print(
                                "Too many RTSP "
                                "frame failures."
                            )

                            print(
                                "Reconnecting..."
                            )

                            break


                        time.sleep(
                            0.01
                        )

                        continue


                    # Valid frame.
                    failed_reads = 0


                    # ----------------------------------------
                    # RESIZE
                    # ----------------------------------------

                    frame = cv2.resize(
                        frame,

                        (
                            STREAM_WIDTH,
                            STREAM_HEIGHT
                        ),

                        interpolation=(
                            cv2.INTER_LINEAR
                        )
                    )


                    # ----------------------------------------
                    # FRAME COUNTER
                    # ----------------------------------------

                    self.frame_counter += 1


                    # ----------------------------------------
                    # FRAME SKIP
                    # ----------------------------------------

                    if (
                        FRAME_SKIP > 1
                        and
                        self.frame_counter
                        %
                        FRAME_SKIP
                        != 0
                    ):

                        continue


                    # ----------------------------------------
                    # STORE ONLY NEWEST FRAME
                    # ----------------------------------------

                    with self.raw_lock:

                        self.raw_frame = frame


            except Exception as error:

                print(
                    "RTSP capture error: "
                    f"{error}"
                )


            finally:

                if self.camera is not None:

                    try:

                        self.camera.release()

                    except Exception:

                        pass


                    self.camera = None


            # ------------------------------------------------
            # No signal while reconnecting
            # ------------------------------------------------

            self._set_no_signal()


            if not self.stop_event.is_set():

                print(
                    "RTSP reconnect in "
                    "1 second..."
                )

                self.stop_event.wait(
                    1
                )


    # ========================================================
    # YOLO THREAD
    # ========================================================

    def _inference_loop(self):

        while not self.stop_event.is_set():

            frame = None


            # ------------------------------------------------
            # Get newest frame
            # ------------------------------------------------

            with self.raw_lock:

                if (
                    self.raw_frame
                    is not None
                ):

                    frame = (
                        self.raw_frame.copy()
                    )

                    # Clear immediately.
                    #
                    # We don't want to process
                    # the same frame repeatedly.
                    self.raw_frame = None


            # No frame available.
            if frame is None:

                time.sleep(
                    0.003
                )

                continue


            try:

                # --------------------------------------------
                # YOLO
                # --------------------------------------------

                processed_frame = (
                    pothole_detector.annotate(
                        frame
                    )
                )


                # --------------------------------------------
                # JPEG
                # --------------------------------------------

                success, buffer = (
                    cv2.imencode(
                        ".jpg",
                        processed_frame,

                        [
                            cv2.IMWRITE_JPEG_QUALITY,
                            JPEG_QUALITY
                        ]
                    )
                )


                if success:

                    # ----------------------------------------
                    # Replace previous JPEG.
                    #
                    # NEVER queue multiple JPEGs.
                    # ----------------------------------------

                    with self.jpeg_lock:

                        self.latest_jpeg = (
                            buffer.tobytes()
                        )


            except Exception as error:

                print(
                    "Inference pipeline "
                    f"error: {error}"
                )

                time.sleep(
                    0.01
                )


    # ========================================================
    # NO SIGNAL
    # ========================================================

    def _set_no_signal(self):

        with self.jpeg_lock:

            self.latest_jpeg = (
                create_no_signal_frame()
            )


    # ========================================================
    # GET CURRENT FRAME
    # ========================================================

    def get_frame(self):

        with self.jpeg_lock:

            return self.latest_jpeg


    # ========================================================
    # STOP
    # ========================================================

    def stop(self):

        print(
            "Stopping camera stream:"
        )

        print(
            self.rtsp_url
        )


        self.stop_event.set()


        if self.camera is not None:

            try:

                self.camera.release()

            except Exception:

                pass


# ============================================================
# CAMERA STREAM MANAGER
# ============================================================

class CameraStreamManager:

    def __init__(self):

        self.streams = {}

        self.lock = (
            threading.Lock()
        )


    def get(
        self,
        camera_id,
        rtsp_url
    ):

        with self.lock:

            stream = self.streams.get(
                camera_id
            )


            # ------------------------------------------------
            # Create or replace stream
            # ------------------------------------------------

            if (
                stream is None
                or
                stream.rtsp_url
                !=
                rtsp_url
            ):

                if stream is not None:

                    stream.stop()


                stream = CameraStream(
                    rtsp_url
                )


                self.streams[
                    camera_id
                ] = stream


            return stream


    def remove(
        self,
        camera_id
    ):

        with self.lock:

            stream = (
                self.streams.pop(
                    camera_id,
                    None
                )
            )


            if stream is not None:

                stream.stop()


# ============================================================
# GLOBAL CAMERA MANAGER
# ============================================================

camera_streams = (
    CameraStreamManager()
)


# ============================================================
# FLASK FRAME GENERATOR
# ============================================================

def generate_frames(
    camera_stream
):

    last_frame = None


    while True:

        # ----------------------------------------------------
        # Stop if camera was removed.
        # ----------------------------------------------------

        if camera_stream.stop_event.is_set():

            break


        # ----------------------------------------------------
        # Get latest JPEG.
        # ----------------------------------------------------

        frame = (
            camera_stream.get_frame()
        )


        if not frame:

            time.sleep(
                0.01
            )

            continue


        # ----------------------------------------------------
        # Don't send exactly same frame repeatedly.
        # ----------------------------------------------------

        if frame == last_frame:

            time.sleep(
                0.005
            )

            continue


        last_frame = frame


        # ----------------------------------------------------
        # MJPEG
        # ----------------------------------------------------

        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n"
            b"Cache-Control: no-cache\r\n\r\n"
            +
            frame
            +
            b"\r\n"
        )


        # Very small sleep to prevent
        # 100% CPU usage.
        time.sleep(
            0.005
        )


# ============================================================
# LOGIN
# ============================================================

def login_required(view):

    @wraps(view)
    def wrapped_view(
        *args,
        **kwargs
    ):

        if not session.get(
            "logged_in"
        ):

            return redirect(
                url_for("login")
            )


        return view(
            *args,
            **kwargs
        )


    return wrapped_view


# ============================================================
# LOGIN PAGE
# ============================================================

@app.route(
    "/login",
    methods=["GET", "POST"]
)
def login():

    if session.get(
        "logged_in"
    ):

        return redirect(
            url_for("home")
        )


    error = None


    if request.method == "POST":

        username = (
            request.form
            .get(
                "username",
                ""
            )
            .strip()
        )


        password = (
            request.form
            .get(
                "password",
                ""
            )
        )


        if (
            username == "admin"
            and
            password == "admin"
        ):

            session[
                "logged_in"
            ] = True


            return redirect(
                url_for("home")
            )


        error = (
            "Invalid login ID "
            "or password."
        )


    return render_template(
        "login.html",
        error=error
    )


# ============================================================
# HOME
# ============================================================

@app.route("/")
@login_required
def home():

    cameras = get_cameras()

    primary_camera = (
        get_primary_camera()
    )

    camera_stats = (
        get_camera_stats()
    )


    return render_template(
        "index.html",

        cameras=cameras,

        primary_camera=(
            primary_camera
        ),

        camera_stats=(
            camera_stats
        ),

        camera_stream_available=(
            bool(
                primary_camera
                or
                cameras
            )
        )
    )


# ============================================================
# ADD CAMERA
# ============================================================

@app.route(
    "/add-camera",
    methods=["GET", "POST"]
)
@login_required
def add_camera():

    error = None

    success = None


    if request.method == "POST":

        camera_name = (
            request.form
            .get(
                "camera_name",
                ""
            )
            .strip()
        )


        rtsp_url = (
            request.form
            .get(
                "rtsp_url",
                ""
            )
            .strip()
        )


        if (
            not camera_name
            or
            not rtsp_url
        ):

            error = (
                "Camera name and "
                "RTSP link are required."
            )

        else:

            added_id = (
                add_camera_record(
                    camera_name,
                    rtsp_url
                )
            )


            success = (
                "Camera saved "
                "successfully."
            )


            return redirect(
                url_for(
                    "camera_detail",
                    camera_id=added_id
                )
            )


    return render_template(
        "add_camera.html",
        error=error,
        success=success
    )


# ============================================================
# CAMERA OVERVIEW
# ============================================================

@app.route(
    "/camera-view"
)
@login_required
def camera_overview():

    cameras = get_cameras()


    return render_template(
        "camera_view.html",

        cameras=cameras,

        camera_stream_available=(
            bool(cameras)
        ),

        camera_status=(
            "Offline"
            if not cameras
            else
            "Live"
        )
    )


# ============================================================
# CAMERA DETAIL
# ============================================================

@app.route(
    "/camera-view/<int:camera_id>"
)
@login_required
def camera_detail(
    camera_id
):

    camera = (
        get_camera_by_id(
            camera_id
        )
    )


    if camera is None:

        return redirect(
            url_for(
                "camera_overview"
            )
        )


    return render_template(
        "camera_view.html",

        cameras=[camera],

        camera=camera,

        camera_stream_available=(
            bool(
                camera.get(
                    "rtsp_url"
                )
            )
        ),

        camera_status="Live"
    )


# ============================================================
# SETTINGS
# ============================================================

@app.route(
    "/settings",
    methods=["GET", "POST"]
)
@login_required
def settings_page():

    cameras = get_cameras()

    message = None

    error = None


    if request.method == "POST":

        action = request.form.get(
            "action"
        )


        # ----------------------------------------------------
        # DELETE
        # ----------------------------------------------------

        if action == "delete":

            camera_id = (
                request.form.get(
                    "camera_id",
                    type=int
                )
            )


            if camera_id:

                delete_camera_record(
                    camera_id
                )

                message = (
                    "Camera deleted "
                    "successfully."
                )

            else:

                error = (
                    "Camera ID is required."
                )


        # ----------------------------------------------------
        # EDIT
        # ----------------------------------------------------

        elif action == "edit":

            camera_id = (
                request.form.get(
                    "camera_id",
                    type=int
                )
            )


            camera_name = (
                request.form
                .get(
                    "camera_name",
                    ""
                )
                .strip()
            )


            rtsp_url = (
                request.form
                .get(
                    "rtsp_url",
                    ""
                )
                .strip()
            )


            if (
                camera_id
                and
                camera_name
                and
                rtsp_url
            ):

                update_camera_record(
                    camera_id,
                    camera_name,
                    rtsp_url
                )


                # Force stream restart.
                camera_streams.remove(
                    camera_id
                )


                message = (
                    "Camera updated "
                    "successfully."
                )

            else:

                error = (
                    "Camera name and "
                    "RTSP link are required."
                )


        # ----------------------------------------------------
        # ADD
        # ----------------------------------------------------

        else:

            camera_name = (
                request.form
                .get(
                    "camera_name",
                    ""
                )
                .strip()
            )


            rtsp_url = (
                request.form
                .get(
                    "rtsp_url",
                    ""
                )
                .strip()
            )


            if (
                camera_name
                and
                rtsp_url
            ):

                add_camera_record(
                    camera_name,
                    rtsp_url
                )


                message = (
                    "Camera added "
                    "successfully."
                )

            else:

                error = (
                    "Camera name and "
                    "RTSP link are required."
                )


        cameras = get_cameras()


    return render_template(
        "settings.html",

        cameras=cameras,

        message=message,

        error=error
    )


# ============================================================
# VIDEO FEED
# ============================================================

@app.route(
    "/video_feed"
)
@login_required
def video_feed():

    camera_id = (
        request.args.get(
            "camera_id",
            type=int
        )
    )


    # --------------------------------------------------------
    # Specific camera
    # --------------------------------------------------------

    if camera_id:

        camera = (
            get_camera_by_id(
                camera_id
            )
        )


        if (
            camera is None
            or
            not camera.get(
                "rtsp_url"
            )
        ):

            return (
                "Camera not found",
                404
            )


        rtsp_url = (
            camera["rtsp_url"]
        )


    # --------------------------------------------------------
    # Primary camera
    # --------------------------------------------------------

    else:

        primary_camera = (
            get_primary_camera()
        )


        if not primary_camera:

            return (
                "No camera is configured",
                503
            )


        camera_id = (
            primary_camera["id"]
        )


        rtsp_url = (
            primary_camera.get(
                "rtsp_url",
                ""
            )
        )


    if not rtsp_url:

        return (
            "No camera is configured",
            503
        )


    # --------------------------------------------------------
    # Get/create stream
    # --------------------------------------------------------

    camera_stream = (
        camera_streams.get(
            camera_id,
            rtsp_url
        )
    )


    # --------------------------------------------------------
    # MJPEG response
    # --------------------------------------------------------

    return Response(

        generate_frames(
            camera_stream
        ),

        mimetype=(
            "multipart/x-mixed-replace;"
            " boundary=frame"
        ),

        headers={

            "Cache-Control":
                "no-cache, "
                "no-store, "
                "must-revalidate",

            "Pragma":
                "no-cache",

            "Expires":
                "0",

            "Connection":
                "keep-alive"
        }
    )


# ============================================================
# LOGOUT
# ============================================================

@app.route(
    "/logout"
)
def logout():

    session.clear()

    return redirect(
        url_for("login")
    )


# ============================================================
# EVENTS
# ============================================================

@app.route(
    "/events"
)
@login_required
def events_page():

    events = [

        {
            "type": "ALPR",
            "title": "KA 12 AB 3456",
            "camera": "Main Gate",
            "time": "2026-08-30 08:42:14",
            "status": "Authorized",
            "status_class": "success"
        },

        {
            "type": "ALPR",
            "title": "TN 08 CD 7281",
            "camera": "Parking Exit",
            "time": "2026-08-30 08:39:08",
            "status": "Visitor",
            "status_class": "warning"
        },

        {
            "type": "Face Recognition",
            "title": "John Smith",
            "camera": "Lobby Entry",
            "time": "2026-08-30 08:33:45",
            "status": "Matched",
            "status_class": "success"
        },

        {
            "type": "Face Recognition",
            "title": "Unknown Person",
            "camera": "Rear Door",
            "time": "2026-08-30 08:27:12",
            "status": "Alert",
            "status_class": "danger"
        }
    ]


    return render_template(
        "events.html",
        events=events
    )


# ============================================================
# CONTACT
# ============================================================

@app.route(
    "/contact"
)
def contact():

    return render_template(
        "contact.html"
    )


# ============================================================
# INITIALIZE DATABASE
# ============================================================

init_db()


# ============================================================
# APPLICATION START
# ============================================================

if __name__ == "__main__":

    if verify_license():

        print(
            "================================"
        )

        print(
            "Starting application..."
        )

        print(
            f"Stream resolution: "
            f"{STREAM_WIDTH}x"
            f"{STREAM_HEIGHT}"
        )

        print(
            f"YOLO image size: "
            f"{YOLO_IMGSZ}"
        )

        print(
            f"Frame skip: "
            f"{FRAME_SKIP}"
        )

        print(
            f"JPEG quality: "
            f"{JPEG_QUALITY}"
        )

        print(
            f"YOLO device: "
            f"{pothole_detector.device}"
        )

        print(
            "RTSP transport: TCP"
        )

        print(
            "================================"
        )


        app.run(

            host="0.0.0.0",

            port=int(
                os.getenv(
                    "PORT",
                    "5000"
                )
            ),

            # IMPORTANT:
            # Don't use Flask debug reloader
            # with camera/YOLO background threads.
            debug=False,

            use_reloader=False,

            threaded=True
        )


    else:

        print(
            "Application cannot start."
        )
