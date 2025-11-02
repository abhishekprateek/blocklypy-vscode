"""
Hub Auto Template Generator
Generates a Python template based on connected devices for a SPIKE Hub.
"""

from pybricks.hubs import ThisHub
from pybricks.parameters import Port
from pybricks.iodevices import PUPDevice

# Base template
print("from pybricks.hubs import PrimeHub")
print("from pybricks.pupdevices import Motor, ColorSensor, UltrasonicSensor, ForceSensor")
print("from pybricks.parameters import Button, Color, Direction, Port, Side, Stop")
print("from pybricks.robotics import DriveBase")
print("from pybricks.tools import wait, StopWatch")
print("")
print("hub = PrimeHub()")

# DeviceMonitor feature
portchars = ["A", "B", "C", "D", "E", "F"]
hub = ThisHub()
motors = []
for pc in portchars:
    try:
        port = getattr(Port, pc, None); dev = PUPDevice(port); did = dev.info()["id"]; pcl = pc.lower()
        if did in (48, 49, 65, 75, 76, 38): print(f"motor_{pcl} = Motor({port})"); motors.append(f"motor_{pcl}")
        if did == 63: print(f"force_{pcl} = ForceSensor({port})")
        if did == 62: print(f"usensor_{pcl} = UltrasonicSensor({port})")
        if did in (61,37): print(f"color_{pcl} = ColorSensor({port})")
    except OSError:
        pass
if len(motors) >= 2:
    print(f"robot = DriveBase({motors[0]}, {motors[1]}, wheel_diameter=56, axle_track=114) # Adjust parameters and direction of first motor as needed")
