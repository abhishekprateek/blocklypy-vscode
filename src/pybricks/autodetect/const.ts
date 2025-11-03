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
    capabilities: {
        repl: boolean;
        ports: number;
    };
};

export const HubTypeDescriptors: HubTypeDescriptorType[] = [
    {
        hubType: 'EssentialHub',
        label: 'SPIKE Essential Hub',
        productId: HubType.TechnicSmallHub,
        productVersion: TechnicSmallHubVariant.SpikeEssentialHub,
        capabilities: { repl: true, ports: 2 },
    },
    {
        hubType: 'PrimeHub',
        label: 'SPIKE Prime Hub',
        productId: HubType.TechnicLargeHub,
        productVersion: TechnicLargeHubVariant.SpikePrimeHub,
        capabilities: { repl: true, ports: 6 },
    },
    {
        hubType: 'InventorHub',
        label: 'MINDSTORMS Robot Inventor Hub',
        productId: HubType.TechnicLargeHub,
        productVersion: TechnicLargeHubVariant.MindstormsInventorHub,
        capabilities: { repl: true, ports: 6 },
    },
    {
        hubType: 'CityHub',
        label: 'City Hub',
        productId: HubType.CityHub,
        capabilities: { repl: true, ports: 2 },
    },
    {
        hubType: 'TechnicHub',
        label: 'Technic Hub',
        productId: HubType.TechnicHub,
        capabilities: { repl: true, ports: 4 },
    },
    {
        hubType: 'MoveHub',
        label: 'Move Hub',
        productId: HubType.MoveHub,
        capabilities: { repl: false, ports: 4 },
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
    1: 'Powered Up Medium Motor', // 45303 Powered Up Medium Motor (aka WeDo 2.0 motor)
    2: 'Powered Up Train Motor',

    // Internal devices
    3: 'Powered Up Hub turn',
    4: 'Powered Up Hub power',
    5: 'Powered Up Hub touch',
    6: 'Powered Up Hub lmotor',
    7: 'Powered Up Hub xmotor',

    // Light devices
    8: 'Powered Up Lights',

    // Internal devices
    9: 'Powered Up Light 1',
    10: 'Powered Up Light 2',
    11: 'Powered Up T-Point',
    12: 'Powered Up Explod',
    13: 'Powered Up 3-Part',
    14: 'Powered Up Unknown UART',

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

    // NXT devices (retired)
    77: 'NXT Touch Sensor',
    78: 'NXT Light Sensor',
    79: 'NXT Sound Sensor',
    80: 'NXT Color Sensor',
    81: 'NXT Ultrasonic Sensor',
    82: 'NXT Temperature Sensor',
    83: 'NXT Energy Meter',

    // EV3 devices (retired)
    84: 'EV3 Touch Sensor',
    // PBDRV_LEGODEV_TYPE_ID_EV3_TOUCH_SENSOR = 84
    // 85: 'Mario built-in unknown',
    85: 'EV3 Large Motor',
    // PBDRV_LEGODEV_TYPE_ID_EV3_LARGE_MOTOR = 85
    // 86: 'Technic Move hub built-in drive motor',
    86: 'EV3 Medium Motor',
    // PBDRV_LEGODEV_TYPE_ID_EV3_MEDIUM_MOTOR = 86

    // 87: 'Technic Move hub built-in steering motor',
    87: 'EV3 DC Motor',
    // PBDRV_LEGODEV_TYPE_ID_EV3DEV_DC_MOTOR = 87
    // 88: 'Technic Move hub built-in lights',
    88: 'EV3 LEGO Sensor',
    // PBDRV_LEGODEV_TYPE_ID_EV3DEV_LEGO_SENSOR = 88
    // 89: 'Technic Move hub built-in play VM',
    89: 'NXT LEGO Analog Sensor',
    // PBDRV_LEGODEV_TYPE_ID_NXT_ANALOG = 89
    90: 'NXT LEGO I2C Sensor',
    // PBDRV_LEGODEV_TYPE_ID_NXT_I2C = 90
    91: 'Custom I2C Sensor',
    // PBDRV_LEGODEV_TYPE_ID_CUSTOM_I2C = 91
    // 92: 'Powered Up hub unknown',
    92: 'Custom UART Sensor',
    // PBDRV_LEGODEV_TYPE_ID_CUSTOM_UART = 92

    // 93: 'Powered Up hub IMU orientation',
    93: 'Any Lump UART',
    // PBDRV_LEGODEV_TYPE_ID_ANY_LUMP_UART = 93
    // 94: 'Powered Up hub unknown',
    94: 'Any DC Motor',
    // PBDRV_LEGODEV_TYPE_ID_ANY_DC_MOTOR = 94
    95: 'Powered Up hub unknown',
    // PBDRV_LEGODEV_TYPE_ID_ANY_ENCODED_MOTOR = 95
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
