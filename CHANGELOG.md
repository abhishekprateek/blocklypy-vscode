# Change Log

All significant updates to the "blocklypy" extension are tracked in this file.

## Unreleased

## Added

- Addded Pybricks templates and auto-detection for LEGO hubs
- Added comprehensive "Getting Started" walktrough
- Added idle disconnection feature

## [0.7.13] - 2025-10-31

## Added

- Added Jupyter notebook support with "MicroPython on LEGO Hub" kernel
- Upload enhanced with progress display and cancellation support

## [0.7.10] - 2025-10-21

## Added

- Improve log visuals
- Showing errors in converted files

## Fixed

- fixed inconsistent F5 / Control+F5 handling

## [0.7.7] - 2025-10-19

## Added

- AIPP (AppData Instrumentation Protocol for Pybricks) channel handling
- VSCode debug session over AIPP for a single file with breakpoints, variable get/set
- Plot over AIPP
- Device Notification monitoring to data log
- Pybricks REPL starting from command
- Experimental: REPL sending hubmonitor
- Offical SPIKE Prime HubOS support, including SPIKE Essential and
Robot Inventor Mindstorms Hubs.
- HubOS tunnel handling, weather notification response, plotting / logging
- USB support for HubOS

## [0.4.1] - 2025-09-16

## Added

- Added advanced data logging per "plot: " lines

## [0.3.2] - 2025-09-14

### Added

- Added data logging per "plot: " lines

## [0.3.1] - 2025-09-13

### Added

- Command to stop user programs
- Enhanced bidirectional debug channel terminal support

### Changed

- Conversion warnings now appear in the debug channel
- Fixed issue where compiling and uploading an empty workspace (0 bytes) caused errors
- Improved handling of the debug terminal

## [0.3.0] - 2025-09-12

### Added

- Redesigned and simplified device management UI
- Support for `hub.ble.broadcast` events

## [0.2.4] - 2025-09-09

### Added

- Improved device connection logic
- Display of BLE signal strength

### Changed

- Corrected settings management issues

## [0.2.1] - 2025-09-07

### Added

- Error display now supports LEGO files

### Changed

- Fixed visibility of title button based on connection status

## [0.2.0] - 2025-09-07

### Added

- Screenshot support for WeDo 2.0

## [0.1.2] - 2025-09-06

### Added

- Icon theming for light and dark modes
- Content-aware display modes: preview, Python code, pseudocode, and graph
- Enhanced README and screenshots

### Changed

- Document handling now supports multiple LEGO documents

## [0.1.1] - 2025-09-05

### Added

- Initial release
- Pybricks BLE connection and code compilation
- Support for opening BlocklyPy files
