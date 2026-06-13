# gesture_detector.py
import cv2
import mediapipe as mp
import math
import config

class GestureDetector:
    def __init__(self):
        self.mp_hands = mp.solutions.hands
        self.hands = self.mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=1,
            model_complexity=0,  # Fast model for low CPU usage
            min_detection_confidence=0.7,
            min_tracking_confidence=0.7
        )
        self.mp_drawing = mp.solutions.drawing_utils
        self.mp_drawing_styles = mp.solutions.drawing_styles
        
        self.history = []
        self.last_confirmed_gesture = "NONE"
        
    def process_frame(self, frame):
        """
        Process the image with MediaPipe and return the landmarks and hand tracking result.
        """
        # Convert BGR to RGB
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self.hands.process(rgb_frame)
        return results

    def classify_gesture(self, landmarks):
        """
        Classify the current hand posture based on landmark positions.
        """
        # 1. Check Pinch (Index Tip to Thumb Tip distance)
        thumb_tip = landmarks[4]
        index_tip = landmarks[8]
        
        # Calculate raw pixel coordinates on a 640x480 frame
        t_x, t_y = thumb_tip.x * config.FRAME_WIDTH, thumb_tip.y * config.FRAME_HEIGHT
        i_x, i_y = index_tip.x * config.FRAME_WIDTH, index_tip.y * config.FRAME_HEIGHT
        
        pinch_dist = math.sqrt((t_x - i_x)**2 + (t_y - i_y)**2)
        
        if pinch_dist < config.PINCH_THRESHOLD_PX:
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
            for hand_landmarks in results.multi_hand_landmarks:
                self.mp_drawing.draw_landmarks(
                    frame,
                    hand_landmarks,
                    self.mp_hands.HAND_CONNECTIONS,
                    self.mp_drawing.DrawingSpec(color=(0, 255, 0), thickness=2, circle_radius=2),
                    self.mp_drawing.DrawingSpec(color=(255, 0, 0), thickness=2)
                )
