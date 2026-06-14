import cv2
from gesture_detector import GestureDetector
import time

detector = GestureDetector()
cap = cv2.VideoCapture(0)
if not cap.isOpened():
    cap = cv2.VideoCapture(1)

print("Starting detection test. Show your hand in front of the camera...")
start_time = time.time()
while time.time() - start_time < 5:
    ret, frame = cap.read()
    if not ret:
        print("Failed to read frame")
        break
    
    results = detector.process_frame(frame)
    if results.multi_hand_landmarks:
        print(f"Hand detected! Number of hands: {len(results.multi_hand_landmarks)}")
        landmarks = results.multi_hand_landmarks[0].landmark
        print(f"Landmark 0 (wrist): x={landmarks[0].x:.3f}, y={landmarks[0].y:.3f}")
    else:
        print("No hand detected")
    time.sleep(0.5)

cap.release()
