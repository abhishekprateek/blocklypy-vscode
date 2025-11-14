"""
Hub Auto Detect
Detects and lists all connected devices on a SPIKE Prime, RI, Technic or City Hub.

Returns: List of [port, device_type_id] pairs
"""

from pybricks.parameters import Port; from pybricks.iodevices import PUPDevice
def gp(pc):
  try: return PUPDevice(getattr(Port,pc)).info()['id']
  except: return 0
print('AUTODETECT', [[pc,gp(pc)] for pc in dir(Port)])