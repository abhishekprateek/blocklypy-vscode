"""
Hub Auto Detect
Detects and lists all connected devices on a SPIKE Prime, RI, Technic or City Hub.

Returns: List of [port, device_type_id] pairs
"""

from pybricks.hubs import ThisHub
from pybricks.iodevices import PUPDevice
from pybricks.parameters import Port
detect = []; hub = ThisHub
for pc in 'ABCDEF':
  try:
    # MoveHub fails on getting the attribute, while PrimeHub does not
    # port = getattr(Port,pc,None)
    port = eval("Port."+pc)
    try: detect.append([pc,PUPDevice(port).info()['id']])
    except: detect.append([pc,0])
  except: pass
print("AUTODETECT", detect)