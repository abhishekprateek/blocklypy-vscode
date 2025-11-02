import {
    HubType,
    TechnicLargeHubVariant,
    TechnicSmallHubVariant,
} from '../ble-lwp3-service/protocol';

export type HubTypeDescriptorType = {
    hubType: string;
    label: string;
    productId?: HubType;
    productVersion?: number;
};

export const HubTypeDescriptors: HubTypeDescriptorType[] = [
    {
        hubType: 'EssentialHub',
        label: 'SPIKE Essential Hub',
        productId: HubType.TechnicSmallHub,
        productVersion: TechnicSmallHubVariant.SpikeEssentialHub,
    },
    {
        hubType: 'PrimeHub',
        label: 'SPIKE Prime Hub',
        productId: HubType.TechnicLargeHub,
        productVersion: TechnicLargeHubVariant.SpikePrimeHub,
    },
    {
        hubType: 'InventorHub',
        label: 'MINDSTORMS Robot Inventor Hub',
        productId: HubType.TechnicLargeHub,
        productVersion: TechnicLargeHubVariant.MindstormsInventorHub,
    },
    {
        hubType: 'CityHub',
        label: 'City Hub',
        productId: HubType.CityHub,
    },
    {
        hubType: 'TechnicHub',
        label: 'Technic Hub',
        productId: HubType.TechnicHub,
    },
    {
        hubType: 'MoveHub',
        label: 'Move Hub',
        productId: HubType.MoveHub,
    },
];

/**
 * Device ID to device name mapping
 * Sources:
 * - https://docs.pybricks.com/en/latest/iodevices/pupdevice.html
 * - https://lego.github.io/lego-ble-wireless-protocol-docs/index.html#p-id
 * - https://github.com/pybricks/technical-info/blob/master/assigned-numbers.md
 */
export const DEVICE_NAMES: Record<number, string> = {
    // No device
    0: 'No device',

    // DCMotor devices
    1: 'Powered Up Medium Motor',
    2: 'Powered Up Train Motor',

    // Light devices
    8: 'Powered Up Lights',

    // Hub internal sensors
    20: 'Powered Up Hub battery voltage',
    21: 'Powered Up Hub battery current',
    22: 'Powered Up Hub piezo tone',
    23: 'Powered Up Hub indicator light',

    // EV3 devices (retired)
    29: 'EV3 Color Sensor',
    30: 'EV3 Ultrasonic Sensor',
    32: 'EV3 Gyro Sensor',
    33: 'EV3 Infrared Sensor',

    // WeDo 2.0 devices
    34: 'WeDo 2.0 Tilt Sensor',
    35: 'WeDo 2.0 Motion Sensor',
    36: 'WeDo 2.0 generic device',

    // BOOST devices
    37: 'BOOST Color and Distance Sensor',
    38: 'BOOST Interactive Motor',
    39: 'BOOST Move Hub built-in motor',
    40: 'BOOST Move Hub built-in accelerometer',

    // DUPLO Train hub devices
    41: 'DUPLO Train hub built-in motor',
    42: 'DUPLO Train hub built-in beeper',
    43: 'DUPLO Train hub built-in color sensor',
    44: 'DUPLO Train hub built-in speed sensor',

    // Technic Control+ devices
    46: 'Technic Control+ Large Motor',
    47: 'Technic Control+ XL Motor',
    48: 'SPIKE Prime Medium Motor',
    49: 'SPIKE Prime Large Motor',
    50: 'Technic Control+ Hub',

    // Hub IMU and control devices
    54: 'Powered Up hub IMU gesture',
    55: 'Powered Up Handset Buttons',
    56: 'Powered Up hub Bluetooth RSSI',
    57: 'Powered Up hub IMU accelerometer',
    58: 'Powered Up hub IMU gyro',
    59: 'Powered Up hub IMU position',
    60: 'Powered Up hub IMU temperature',

    // SPIKE/Technic sensors
    61: 'SPIKE/Technic Color Sensor',
    62: 'SPIKE/Technic Ultrasonic Sensor',
    63: 'SPIKE/Technic Force Sensor',
    64: 'SPIKE/Technic 3x3 Color Light Matrix',
    65: 'SPIKE/Technic Small Angular Motor',

    // Mario devices
    70: 'Mario built-in unknown',
    71: 'Mario built-in IMU gesture sensor',
    73: 'Mario built-in color barcode sensor',
    74: 'Mario built-in pants sensor',

    // Technic gray motors
    75: 'Technic Medium Angular Motor (gray)',
    76: 'Technic Large Angular Motor (gray)',

    // Mario additional devices
    85: 'Mario built-in unknown',

    // Technic Move hub devices
    86: 'Technic Move hub built-in drive motor',
    87: 'Technic Move hub built-in steering motor',
    88: 'Technic Move hub built-in lights',
    89: 'Technic Move hub built-in play VM',

    // Additional hub features
    92: 'Powered Up hub unknown',
    93: 'Powered Up hub IMU orientation',
    94: 'Powered Up hub unknown',
};

/**
 * Motor size classification map
 * Maps motor device IDs to size categories:
 * 1 = Small (or built-in)
 * 2 = Medium
 * 3 = Large
 * 4 = Extra Large (XL)
 */
export const MOTOR_SIZES: Record<number, number> = {
    // Small motors (size 1)
    39: 1, // BOOST Move Hub built-in motor
    41: 1, // DUPLO Train hub built-in motor
    65: 1, // SPIKE/Technic Small Angular Motor
    86: 1, // Technic Move hub built-in drive motor
    87: 1, // Technic Move hub built-in steering motor

    // Medium motors (size 2)
    38: 2, // BOOST Interactive Motor
    48: 2, // SPIKE Prime Medium Motor
    75: 2, // Technic Medium Angular Motor (gray)

    // Large motors (size 3)
    46: 3, // Technic Control+ Large Motor
    49: 3, // SPIKE Prime Large Motor
    76: 3, // Technic Large Angular Motor (gray)

    // Extra Large motors (size 4)
    47: 4, // Technic Control+ XL Motor
};
