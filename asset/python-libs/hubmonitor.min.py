from ustruct import pack
from pybricks.hubs import ThisHub; from pybricks.parameters import Side,Port
from pybricks.tools import wait,AppData; from pybricks.iodevices import PUPDevice

class DM:
  face_map = {Side.TOP:0,Side.BOTTOM:1,Side.LEFT:2,Side.RIGHT:3,Side.FRONT:4,Side.BACK:5}

  def __init__(self,hub,appdata):
    self.hub = hub; self.ports = [getattr(Port,p,None) for p in dir(Port)]
    self.devs = [None]*len(self.ports); self.infos = [None]*len(self.ports)
    self.detect = [-60]*len(self.ports); self.i = 0; self.appdata = appdata

  def get_dev_payload(self,pi,dev,info):
    did = info.get('id')
    try:
      if did in (48,49,65,75,76,38):
        ap,pwr,spd = dev.read(2)[0],dev.read(0)[0],dev.read(1)[0]
        pos = dev.read(3)[0] if len(dev.info().get('modes',[]))>3 else ap
        return pack('<BBBhhbi',0x0a,pi,did,ap,pwr,spd,int(pos))
      if did == 63:
        f,p = dev.read(0)[0],bool(dev.read(1)[0]); return pack('<BBBB',0x0b,pi,f,1 if p else 0)
      if did == 62: return pack('<BBh',0x0d,pi,dev.read(0)[0])
      if did == 61:
        # c,rgb = dev.read(0)[0],dev.read(3); r,g,b = (rgb if len(rgb) == 3 else (0,0,0))
        c,r,g,b = dev.read(0)[0], 0, 0, 0 # color sensor does not support RGB and COLOR, will flicker
        return pack('<BBBHHH',0x0c,pi,c,r,g,b)
      if did == 37:
        c,d = dev.read(0)[0],dev.read(1)[0]; return pack('<BBBHHH',0x0c,pi,c,0,0,0)+pack('<BBh',0x0d,pi,d)
    except: pass
    return None

  def loop_check(self,interval_ms=30):
    while True:
      self.i += 1; v = self.hub.battery.voltage(); p = min(100,max(0,int((v-6000)/(8300-6000)*100)))
      payloads = [pack('<BB',0x00,p)]; up = self.hub.imu.up()
      y,(pi,ro),(ax,ay,az),(gx,gy,gz) = self.hub.imu.heading(),self.hub.imu.tilt(),self.hub.imu.acceleration(),\
        self.hub.imu.angular_velocity()
      payloads.append(pack('<BBBhhhhhhhhh',0x01,int(up == Side.TOP),self.face_map.get(up,0),int(y),int(pi),int(ro),\
        int(ax),int(ay),int(az),int(gx),int(gy),int(gz)))
      for idx,port in enumerate(self.ports):
        try:
          if self.devs[idx] is None and self.i > self.detect[idx]+60:
            d = PUPDevice(port); self.devs[idx],self.infos[idx] = d,d.info()
          d,info = self.devs[idx],self.infos[idx]
          if d and info:
            p = self.get_dev_payload(idx,d,info)
            if p: payloads.append(p)
        except:
          self.devs[idx] = self.infos[idx] = None; self.detect[idx] = self.i
      d = b''.join(payloads); aipp_send(pack('<BH',0x3c,len(d)) + d,self.appdata); wait(interval_ms)

def aipp_send(data,appdata):
  mtu = 17; data += bytes([sum(data) & 0xFF])
  for i in range(0,len(data),mtu):
    appdata.write_bytes((b'\xfe' if i == 0 else b'\xff') + data[i:i+mtu] + (b'\x00' if (i+mtu) >= len(data) else b'\xff'))
    wait(10)

DM(ThisHub(),AppData('')).loop_check(100)
