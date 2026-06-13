# tray.py
import webbrowser
from PIL import Image, ImageDraw, ImageFont
import pystray
from pystray import MenuItem as item

class TrayIcon:
    def __init__(self, on_action_callback):
        self.on_action = on_action_callback
        self.status = "starting"  # starting, running, recovering, error
        self.status_msg = "Starting..."
        self.gesture_active = True
        self.icon = None
        self._create_icon()
        
    def _create_icon(self):
        color = (230, 190, 30)  # Yellow starting state
        self.icon_image = self._generate_icon_image(color)
        
        # Define context menu
        self.menu = pystray.Menu(
            item('🤖 FRIDAY AI', lambda: None, enabled=False),
            item(self._get_status_label, lambda: None, enabled=False),
            pystray.Menu.SEPARATOR,
            item('🌐 Open FRIDAY', self._on_open_friday),
            pystray.Menu.SEPARATOR,
            item(self._get_gesture_label, self._on_toggle_gesture),
            pystray.Menu.SEPARATOR,
            item('🔄 Restart Backend', self._on_restart_backend),
            item('🔄 Restart Frontend', self._on_restart_frontend),
            item('🔄 Restart Gesture', self._on_restart_gesture),
            pystray.Menu.SEPARATOR,
            item('❌ Quit FRIDAY', self._on_quit)
        )
        
        self.icon = pystray.Icon(
            "FridayLauncher",
            icon=self.icon_image,
            title="FRIDAY AI Controller",
            menu=self.menu
        )
        
    def _generate_icon_image(self, color):
        width, height = 64, 64
        # Create a transparent base image
        image = Image.new('RGBA', (width, height), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)
        
        # Draw status circle
        draw.ellipse((2, 2, width-3, height-3), fill=color, outline=(255, 255, 255), width=3)
        
        # Center letter 'F'
        try:
            font = ImageFont.truetype("arial.ttf", 36)
        except IOError:
            font = ImageFont.load_default()
            
        bbox = draw.textbbox((0, 0), "F", font=font)
        w = bbox[2] - bbox[0]
        h = bbox[3] - bbox[1]
        
        draw.text(((width - w)/2, (height - h)/2 - 4), "F", fill=(255, 255, 255), font=font)
        return image
        
    def _get_status_label(self, item):
        return f"● {self.status_msg}"
        
    def _get_gesture_label(self, item):
        action = "OFF" if self.gesture_active else "ON"
        return f"✋ Gesture → Toggle {action}"
        
    def _on_open_friday(self):
        webbrowser.open("http://localhost:3000")
        
    def _on_toggle_gesture(self):
        self.gesture_active = not self.gesture_active
        self.on_action("toggle_gesture", self.gesture_active)
        
    def _on_restart_backend(self):
        self.on_action("restart_backend", None)
        
    def _on_restart_frontend(self):
        self.on_action("restart_frontend", None)
        
    def _on_restart_gesture(self):
        self.on_action("restart_gesture", None)
        
    def _on_quit(self):
        self.on_action("quit", None)
        self.icon.stop()
        
    def update_status(self, status, message, gesture_active=None):
        """
        Updates the tray icon state and refreshes drawing.
        """
        self.status = status
        self.status_msg = message
        if gesture_active is not None:
            self.gesture_active = gesture_active
            
        if status == "running":
            color = (40, 160, 40)      # Green: All running
        elif status in ["starting", "recovering"]:
            color = (230, 190, 30)     # Yellow: Recovering/booting
        else:
            color = (200, 40, 40)      # Red: Error
            
        self.icon_image = self._generate_icon_image(color)
        self.icon.icon = self.icon_image
        
    def send_notification(self, title, message):
        """
        Sends a balloon tooltip notification to the Windows Action Center.
        """
        try:
            self.icon.notify(message, title)
        except Exception as e:
            print(f"[ERROR] Notification failed: {e}")
            
    def run(self):
        """
        Run the pystray blocking loop.
        """
        self.icon.run()
