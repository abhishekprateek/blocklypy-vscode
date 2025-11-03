"""
Hub Auto Detect
Detects and lists all connected devices on a SPIKE Move Hub.

Returns: List of [port, device_type_str] pairs

TODO: no REPL in MoveHub
"""

from pybricks.hubs import ThisHub
from pybricks.parameters import Port
pup = __import__("pybricks.pupdevices")
detect = []; hub = ThisHub
for pc in 'ABCDEF':
  try:
    # MoveHub fails on getting the attribute, while PrimeHub does not - so this is ok
    port = getattr(Port,pc,None)
    # port = eval(f"Port.{pc}") # MoveHub does not use eval
    if port is None: continue
    for devtype in dir(pup):
        try: getattr(pup, devtype)(port); detect.append([pc,devtype]); break
        except: pass
    else: detect.append([pc,0])
  except: pass
print("AUTODETECT", detect)
