"""
Hub Auto Detect
Detects and lists all connected devices on a SPIKE Prime, RI, Technic or City Hub.

Returns: List of [port, device_type_id] pairs
"""

from pybricks.hubs import ThisHub
from pybricks.iodevices import PUPDevice
from pybricks.parameters import Port
detect = []; hub = ThisHub
for pc in dir(Port):
  try: port = getattr(Port,pc); detect.append([pc,PUPDevice(port).info()['id']])
  except: detect.append([pc,0])
  
print("AUTODETECT", detect)