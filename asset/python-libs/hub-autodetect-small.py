from pybricks.hubs import ThisHub
from pybricks.iodevices import PUPDevice
from pybricks.parameters import Port
detect = []; hub = ThisHub
for pc in 'ABCDEF':
  try:
    port = getattr(Port,pc,None)
    try: detect.append([pc,PUPDevice(port).info()['id']])
    except: detect.append([pc,0])
  except: pass
print("AUTODETECT", detect)