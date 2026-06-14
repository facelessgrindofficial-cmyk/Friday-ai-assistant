import cv2
import math
import config
import os
import urllib.request
import time
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

# --- Monkey-patch cv2.VideoCapture to try index 1 if 0 fails ---
_original_VideoCapture = cv2.VideoCapture

class FallbackVideoCapture(_original_VideoCapture):
    def __init__(self, index, *args, **kwargs):
        super().__init__(index, *args, **kwargs)
        if index == 0 and not self.isOpened():
            print("[SYSTEM] Camera index 0 failed. Trying camera index 1...")
            super().__init__(1, *args, **kwargs)

cv2.VideoCapture = FallbackVideoCapture
# ---------------------------------------------------------------

class GestureDetector:
    def __init__(self):
        model_path = "hand_landmarker.task"
        if not os.path.exists(model_path):
            print("[SYSTEM] Downloading hand_landmarker.task...")
            url = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
            try:
                urllib.request.urlretrieve(url, model_path)
                print("[SYSTEM] Model downloaded successfully.")
            except Exception as e:
                print(f"[ERROR] Failed to download model: {e}")

        base_options = python.BaseOptions(model_asset_path=model_path)
        options = vision.HandLandmarkerOptions(
            base_options=base_options,
            num_hands=1,
            min_hand_detection_confidence=0.5,
            min_hand_presence_confidence=0.5,
            min_tracking_confidence=0.5,
            running_mode=vision.RunningMode.VIDEO)
        self.detector = vision.HandLandmarker.create_from_options(options)
        
        self.history = []
        self.last_confirmed_gesture = "NONE"
        self._last_timestamp_ms = 0
        
    def process_frame(self, frame):
        """
        Process the image with MediaPipe Tasks and return the landmarks and hand tracking result.
        """
        # Convert BGR to RGB
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
        
        # Calculate strictly increasing timestamp in ms
        timestamp_ms = int(time.time() * 1000)
        if timestamp_ms <= self._last_timestamp_ms:
            timestamp_ms = self._last_timestamp_ms + 1
        self._last_timestamp_ms = timestamp_ms
        
        results = self.detector.detect_for_video(mp_image, timestamp_ms)
        
        class DummyHand:
            def __init__(self, lms):
                self.landmark = lms

        class DummyResults:
            def __init__(self, res):
                if res.hand_landmarks:
                    self.multi_hand_landmarks = [DummyHand(hl) for hl in res.hand_landmarks]
                else:
                    self.multi_hand_landmarks = None
                    
        return DummyResults(results)

    def classify_gesture(self, landmarks):
        """
        Classify the current hand posture based on landmark positions.
        """
        # Calculate 2D hand size (Wrist 0 to Middle MCP 9)
        wrist = landmarks[0]
        middle_mcp = landmarks[9]
        hand_size = math.sqrt((wrist.x - middle_mcp.x)**2 + (wrist.y - middle_mcp.y)**2)
        if hand_size < 0.01:
            hand_size = 0.01

        # 1. Check Pinch (Index Tip 8 to Thumb Tip 4 distance, normalized to hand size)
        thumb_tip = landmarks[4]
        index_tip = landmarks[8]
        
        pinch_dist = math.sqrt((thumb_tip.x - index_tip.x)**2 + (thumb_tip.y - index_tip.y)**2)
        pinch_ratio = pinch_dist / hand_size
        
        if pinch_ratio < config.PINCH_THRESHOLD_RATIO:
            return "PINCH"
            
        # 2. Check individual finger extensions (UP if tip is higher than PIP joint)
        index_up = landmarks[8].y < landmarks[6].y
        middle_up = landmarks[12].y < landmarks[10].y
        ring_up = landmarks[16].y < landmarks[14].y
        pinky_up = landmarks[20].y < landmarks[18].y
        
        # Thumb extended check: distance from thumb tip (4) to index MCP joint (5)
        thumb_dist = math.sqrt((landmarks[4].x - landmarks[5].x)**2 + (landmarks[4].y - landmarks[5].y)**2)
        thumb_up = thumb_dist > 0.07
        
        # 3. Match against gesture definitions
        # Open Palm: all 5 fingers extended
        if index_up and middle_up and ring_up and pinky_up and thumb_up:
            return "OPEN_PALM"
            
        # Screenshot: Index, Middle, Ring extended
        if index_up and middle_up and ring_up and not pinky_up:
            return "SCREENSHOT"
            
        # Scroll: Index and Middle extended
        if index_up and middle_up and not ring_up and not pinky_up:
            return "SCROLL"
            
        # Move: Only index extended
        if index_up and not middle_up and not ring_up and not pinky_up:
            return "MOVE"
            
        # Fist: all 4 major fingers folded down
        if not index_up and not middle_up and not ring_up and not pinky_up:
            return "FIST"
            
        return "IDLE"

    def get_confirmed_gesture(self, results):
        """
        Processes the raw classification and runs it through the confirmation buffer.
        Returns:
            confirmed_gesture (str), state (str) ["CONFIRMED", "BUFFERING", "NO_HAND"], landmarks (list/None)
        """
        if not results.multi_hand_landmarks:
            self.history.clear()
            self.last_confirmed_gesture = "NONE"
            return "NONE", "NO_HAND", None
            
        landmarks = results.multi_hand_landmarks[0].landmark
        raw_gesture = self.classify_gesture(landmarks)
        
        # Add to confirmation buffer history
        self.history.append(raw_gesture)
        if len(self.history) > config.CONFIRMATION_FRAMES:
            self.history.pop(0)
            
        # Confirm only if the history buffer is full of identical gestures
        if len(self.history) == config.CONFIRMATION_FRAMES and len(set(self.history)) == 1:
            self.last_confirmed_gesture = self.history[0]
            state = "CONFIRMED"
        else:
            state = "BUFFERING"
            
        return self.last_confirmed_gesture, state, landmarks

    def draw_landmarks(self, frame, results):
        """
        Draw the hand skeleton onto the image frame.
        """
        if results.multi_hand_landmarks:
            h, w, _ = frame.shape
            for hand in results.multi_hand_landmarks:
                landmarks = hand.landmark
                points = []
                for lm in landmarks:
                    px, py = int(lm.x * w), int(lm.y * h)
                    points.append((px, py))
                    cv2.circle(frame, (px, py), 2, (0, 255, 0), -1)
                
                # Draw connections
                HAND_CONNECTIONS = [
                    (0, 1), (1, 2), (2, 3), (3, 4),
                    (0, 5), (5, 6), (6, 7), (7, 8),
                    (5, 9), (9, 10), (10, 11), (11, 12),
                    (9, 13), (13, 14), (14, 15), (15, 16),
                    (13, 17), (17, 18), (18, 19), (19, 20),
                    (0, 17), (5, 9), (9, 13), (13, 17)
                ]
                for connection in HAND_CONNECTIONS:
                    pt1 = points[connection[0]]
                    pt2 = points[connection[1]]
                    cv2.line(frame, pt1, pt2, (255, 0, 0), 2)
