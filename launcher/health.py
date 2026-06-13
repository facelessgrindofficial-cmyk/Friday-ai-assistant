# health.py
import requests
import psutil

def is_port_in_use(port):
    """
    Checks if a local port is currently in use.
    """
    for conn in psutil.net_connections(kind='inet'):
        try:
            if conn.laddr.port == port:
                return True
        except Exception:
            pass
    return False

def check_backend():
    """
    Verifies Node.js server status on port 5001.
    Expects 200 or 404 (if /health is not defined, 404 still means the server is running).
    """
    try:
        r = requests.get("http://localhost:5001/api/quotes", timeout=2.0)
        return r.status_code == 200
    except requests.RequestException:
        # Fallback to check if port 5001 is listening
        try:
            r = requests.get("http://localhost:5001/health", timeout=2.0)
            return r.status_code in [200, 404]
        except requests.RequestException:
            return False

def check_frontend():
    """
    Verifies Next.js app status on port 3000.
    Expects HTTP 200 from the root landing page.
    """
    try:
        r = requests.get("http://localhost:3000", timeout=2.0)
        return r.status_code == 200
    except requests.RequestException:
        return False

def check_gesture(gesture_pid=None):
    """
    Verifies if gesture_control.py is running.
    Checks by PID if provided, otherwise scans the running process tree.
    """
    if gesture_pid is not None:
        try:
            proc = psutil.Process(gesture_pid)
            if proc.is_running() and proc.status() != psutil.STATUS_ZOMBIE:
                return True
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
        return False
        
    # Process scan fallback
    for proc in psutil.process_iter(['cmdline']):
        try:
            cmd = proc.info['cmdline']
            if cmd and any('gesture_control.py' in part for part in cmd):
                return True
        except (psutil.NoSuchProcess, psutil.AccessDenied, KeyError):
            pass
    return False
