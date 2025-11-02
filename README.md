# BlocklyPy Commander for LEGO Robots

[![Version](https://img.shields.io/visual-studio-marketplace/v/afarago.blocklypy-vscode?label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=afarago.blocklypy-vscode)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A Visual Studio Code extension to interact with LEGO® Hubs running the Pybricks
and official HubOS v3 firmware.

## Features

Streamline your Pybricks and HubOS LEGO SPIKE coding experience with:

- **Connect/disconnect your Hub** via Bluetooth or USB
- **Start/stop programs** directly from VS Code
- **Compile and upload Python scripts** from your workspace
- **View compilation and runtime errors** in your code
- **Auto-connect** to the last used hub
- **Auto-start** your script on save
- **Open and convert** majority of the LEGO robotics file formats
- **Receive program status** and **display hub output messages**
- **Plot** live sensor data and save to csv
- **Quick-start templates** for Pybricks Python files with hub-specific imports\
  and auto detectied devices
- Experimental: **Debug** your code in VSCode

## Getting Started

1. **Install** this extension from the
   [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=afarago.blocklypy-vscode).
2. **Connect** your LEGO Hub via Bluetooth.
3. **Create** a new Pybricks Python file with templates:
   - Open Command Palette (`Ctrl+Shift+P`)
   - Type "New Pybricks Python File" and select your hub type
   - Or type `pybricks` in a Python file to insert a template snippet
4. **Run** your program by pressing `F5` or using the Run button.

## Guide: Fun First Things to Explore

- **Connect** to a SPIKE Pybricks Hub via Bluetooth
- **Connect** to a LEGO SPIKE offical HubOS Hub via Bluetooth
- **Reconnect** to the last Pybricks Hub via Bluetooth
- Check out the **auto-connect** to the last Hub via Bluetooth on VSCode start
- Open a **Pybricks Python file**, compile and upload
- Open a **LEGO standard Python file**, compile and upload
- Use the **auto-start** feature by adding `# LEGO autostart` header
- Check the feedback for any **runtime error** reported by the hub
- Check the feedback from any **print statements** reported by the hub
- **Use imports** from other local python modules
- Open a **depedency graph** to explore the project call dependencies
- Open a **SPIKE hub version 3 or version 2** file to check the blockly preview
- Explore **pseudocode** to see a simplified text representation of the SPIKE
  code
- Check the **converted Pybricks Python** code, compile and run it directly
- Observe the **dependency call graph** for the SPIKE file
- Make changes on the SPIKE source file in the LEGO app, and **see instant
  updates**
- Open a **Robot Inventor MINDSTORMS App file** and check the above features
- Open a **SPIKE Essential Iconblocks file** and check the above features
- Open an **EV3 classic EV3-G file** and check the pseudocode and graph features
- Check the converted python code for the EV3G file; compile and run it
- Download a **compiled and running binary (.rbf) file** from your EV3 hub and
  check the pseudocode, python code and graph features
- Open an **EV3 iPad file** and check the pseudocode, python and graph features
- Open an **EV3 classroom file** and check the pseudocode, python and graph
  features
- Open a **WeDo 2.0 file** to explore pseudocode and Python conversion features
- Visualize sensor data from your hub by using plot commands for datalogging and
  real-time charts

## Supported LEGO File Formats

This extension opens, displays, analyzes, and converts most major LEGO robotics
file formats for easy onboarding, backup, and analysis.

<img src='./screenshots/devtypes/devtype_ev3b.png'>
<img src='./screenshots/devtypes/devtype_ev3classroom.png'>
<img src='./screenshots/devtypes/devtype_ev3g.png'>
<img src='./screenshots/devtypes/devtype_pybricks.png'>
<img src='./screenshots/devtypes/devtype_robotinventor.png'>
<img src='./screenshots/devtypes/devtype_spike.png'>
<img src='./screenshots/devtypes/devtype_wedo2.png'>

### Features for LEGO Files

- Pseudocode representation of block programs
- Graphical preview of block-based code
- Module dependency visualization of code structure
- Convert block code to compatible Pybricks Python code<sup>\*</sup>

<sup>\*Experimental: Please verify converted code and provide feedback.</sup>

### Platforms & File Types

#### SPIKE Prime / Essentials / Robot Inventor platform

SPIKE Prime
([45678](https://www.lego.com/en-us/product/lego-education-spike-prime-set-45678))
and SPIKE Essentials
([45345](https://www.lego.com/en-us/product/lego-education-spike-essential-set-45345))
kit and Robot Inventor
([51515](https://www.lego.com/en-us/product/robot-inventor-51515)) kit for
**word-blocks** and **icon-blocks**.

- SPIKE v2 (`.llsp`) and v3 (`.llsp3`)
- Robot Inventor (`.lms`)

#### EV3 Mindstorms platform

LEGO® MINDSTORMS® EV3
([31313](https://www.lego.com/en-us/product/lego-mindstorms-ev3-31313))
**graphical-blocks** and **compiled-binary**.

- EV3 Classroom (`.lmsp`)
- EV3 Lab (`.ev3`)
- EV3 iPad (`.ev3m`)
- EV3 Lab Compiled Binary (`.rbf`)

#### WeDo 2.0 platform

LEGO® WeDo 2.0
([45300](https://education.lego.com/en-us/products/lego-education-wedo-2-0-core-set/45300/))
**graphical-blocks**.

- LEGO WeDo 2.0 project files (`.proj`)

#### Pybricks platform

- Pybricks Python (`.py`), supports multiple files.

## Auto start

When device is connected, your script can be set to start automatically by
adding a special header comment at the top of your Python file. This allows for
seamless workflow—just save your file and it will upload and run on the hub
automatically.

Example usage:

```python
# LEGO autostart

from pybricks.hubs import PrimeHub
hub.speaker.beep()
```

For LEGO HubOS devices you can use:

```python
# LEGO slot:0 autostart

print('autostarted')
```

## Data Logging

The extension now supports a datalogging view that can plot incoming data in
real-time. This is done by parsing special "plot:" commands from the standard
output of the connected device.

To use this feature:

1. Ensure your device is connected and running code that outputs data in the
   expected format.
2. Run a program that includes plotting commands.
3. The view will automatically update with incoming data, plotting it in
   real-time.
4. Enable the **Auto-Save Plot Data** setting to automatically save incoming
   sensor data to a `.csv` file.

Plotting commands:

- `plot: start col1,col2,...` - Initializes a new plot with specified column
  names.
- `plot: col1: value1, col2: value2, ...` - Adds a new data point with specified
  values for each column. Missing values can be omitted.
- `plot: value1,value2,...` - Adds a new data point with values in order.
  Missing values can be represented by empty entries (e.g., `10,,30`).
- `plot: end` - Ends the current plotting session.

Algorithm:

- The extension listens for lines starting with "plot:".
- It recognizes the "start" command to set up columns and initializes a buffer.
- It processes incoming data lines, filling in values and handling missing data.
- When a complete row of data is ready, it sends it to the webview for plotting.
- Incomplete rows are buffered until they can be completed or flushed on a
  timeout.

Example usage:

```python
from pybricks.hubs import PrimeHub
from pybricks.tools import wait
hub = PrimeHub()

print("plot: start gyro")
while True:
    print(f"plot: {hub.imu.heading()}")
    wait(100)
print("plot: end") # This line will never be reached in this example
```

## Debug Code

The extension now supports launching a VSCode debug session with a Pybricks hub
is connected.

Behind the scenes unofficial AppData channel is used, and due to the limitation
of the framework slightly alters the code by injecting debug traps. This
normally should not affect your code.

### Usage

1. Set breakpoints in your code prior to launching the debug sessions
2. Launch the debug session.
3. After the debugger is stopped on a breakpoint, Step/Continue to the next
   breakpoint

Disclaimer: it is still an early preview, might result in minor problems. Code
is not stopped on any non-breakpoints.

## Pybricks Templates

Quickly start new projects with pre-configured templates for different LEGO
hubs. Templates include common imports and hub initialization code.

**Available methods:**

- **Snippets**: Type `pybricks`, `primehub`, `inventorhub`, etc. in a Python
  file
- **Command**: Use "Insert Pybricks Template" to add to current file
- **New File**: Use "New Pybricks Python File" to create a templated file

The template will also include auto detected devices on any connected device.

Supported hubs: SPIKE Prime, SPIKE Essential, MINDSTORMS Robot Inventor, City
Hub, Technic Hub.

## Limitations

- Only custom modules in the same folder as the main script are supported
- Package structures and relative imports are **not** currently supported
- Runtime error locations may be inaccurate after changing tabs

## Acknowledgements

This project is rooted on the work of Song-Pei Du
[dusongpei](https://github.com/dsp05/pybricks-vscode) and on the work of the
[Pybricks authors](https://github.com/pybricks), Laurens Valk and David Lechner.

Many thanks for the HubOS
[documentation](https://lego.github.io/spike-prime-docs) to the LEGO® group.

## License

This project is licensed under the [MIT License](LICENSE).

## Screenshot

![Screenshot: Overview](./screenshots/1.gif)

![Screenshot: Plot handling](./screenshots/plot.gif)

![Screenshot: View](./screenshots/view-3.png)

![Screenshot: View](./screenshots/view-1.png)

![Screenshot: View](./screenshots/view-4.png)

![Screenshot: View](./screenshots/view-2.png)
