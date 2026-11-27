/** Matter cluster, attribute, command and device type IDs Mapping reads. */

export const CLUSTER_ON_OFF = 6
export const CLUSTER_LEVEL_CONTROL = 8
export const CLUSTER_DESCRIPTOR = 29
export const CLUSTER_BASIC_INFORMATION = 40
export const CLUSTER_COLOR_CONTROL = 768
export const CLUSTER_ELECTRICAL_POWER = 144
export const CLUSTER_ELECTRICAL_ENERGY = 145

/** Descriptor DeviceTypeList. */
export const ATTR_DEVICE_TYPE_LIST = 0
/** BasicInformation VendorName, ProductName and NodeLabel. */
export const ATTR_VENDOR_NAME = 1
export const ATTR_PRODUCT_NAME = 3
export const ATTR_NODE_LABEL = 5
/** OnOff OnOff. */
export const ATTR_ON_OFF = 0
/** LevelControl CurrentLevel, MinLevel and MaxLevel. */
export const ATTR_CURRENT_LEVEL = 0
export const ATTR_MIN_LEVEL = 2
export const ATTR_MAX_LEVEL = 3
/** ColorControl CurrentX, CurrentY and ColorTemperatureMireds. */
export const ATTR_CURRENT_X = 3
export const ATTR_CURRENT_Y = 4
export const ATTR_COLOR_TEMPERATURE = 7
/** ColorControl ColorTempPhysicalMinMireds and ColorTempPhysicalMaxMireds. */
export const ATTR_COLOR_TEMP_MIN = 0x400b
export const ATTR_COLOR_TEMP_MAX = 0x400c

export const COMMAND_OFF = 0x00
export const COMMAND_ON = 0x01
export const COMMAND_TOGGLE = 0x02
/** LevelControl MoveToLevelWithOnOff. */
export const COMMAND_MOVE_TO_LEVEL_WITH_ON_OFF = 0x04
/** ColorControl MoveToColor and MoveToColorTemperature. */
export const COMMAND_MOVE_TO_COLOR = 0x07
export const COMMAND_MOVE_TO_COLOR_TEMPERATURE = 0x0a

export const DEVICE_TYPE_ROOT_NODE = 22
export const DEVICE_TYPE_AGGREGATOR = 14
export const DEVICE_TYPE_ON_OFF_LIGHT = 256
export const DEVICE_TYPE_DIMMABLE_LIGHT = 257
export const DEVICE_TYPE_COLOR_TEMPERATURE_LIGHT = 268
export const DEVICE_TYPE_EXTENDED_COLOR_LIGHT = 269
export const DEVICE_TYPE_ON_OFF_PLUG = 266
export const DEVICE_TYPE_DIMMABLE_PLUG = 267

export const LIGHT_DEVICE_TYPES: readonly number[] = [
    DEVICE_TYPE_ON_OFF_LIGHT,
    DEVICE_TYPE_DIMMABLE_LIGHT,
    DEVICE_TYPE_COLOR_TEMPERATURE_LIGHT,
    DEVICE_TYPE_EXTENDED_COLOR_LIGHT,
]

export const PLUG_DEVICE_TYPES: readonly number[] = [
    DEVICE_TYPE_ON_OFF_PLUG,
    DEVICE_TYPE_DIMMABLE_PLUG,
]
