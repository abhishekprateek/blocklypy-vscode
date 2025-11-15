/** Pybricks Instrumentation Protocol (PIP)
 *
 * Conveys debug and plot messages from Pybricks MicroPython over the SPIKE app data channel.
 * Uses AIPP framing for frame and message boundaries.
 */
import { handleIncomingAIPPDebug } from '../debug-tunnel/debugtunnel-appdata-helper';
import { plotManager } from '../plot/plot';
import { DeviceNotificationMessage } from '../spike/messages/device-notification-message';
import { TunnelNotificationMessage } from '../spike/messages/tunnel-notification-message';
import { TunnelRequestMessage } from '../spike/messages/tunnel-request-message';
import { DataViewExtended } from '../spike/utils/dataview-extended';
import { handleDeviceNotificationAsync } from '../user-hooks/device-notification-hook';

export const AIPP_MODULE_NAME = 'aipp'; // name of the module to import in user code - file name without .py

/**
 * Supported message types.
 */
export enum MessageType {
    DeviceNotification = DeviceNotificationMessage.Id, // uses little-endian
    TunnelNotification = TunnelNotificationMessage.Id, // uses big-endian
    DebugAcknowledge = 0x70, // uses little-endian
    DebugNotification = 0x71, // uses little-endian
    PlotAcknowledge = 0x72, // uses little-endian
    PlotNotification = 0x73, // uses little-endian
}

const DebugMessageLittleEndian = true; // little-endian
const PlotMessageLittleEndian = true; // little-endian

export enum DebugSubCode {
    StartAcknowledge = 0x00,
    StartNotification = 0x01,
    TrapAcknowledge = 0x02,
    TrapNotification = 0x03,
    ContinueRequest = 0x04,
    ContinueResponse = 0x05,
    // EvaluateRequest = 0x06,
    // EvaluateResponse = 0x07,
    SetVariableRequest = 0x08,
    SetVariableResponse = 0x09,
    TerminateRequest = 0x0a,
    TerminateResponse = 0x0b,
}

export enum PlotSubCode {
    Ack = 0x00,
    Define = 0x01,
    UpdateCells = 0x02,
    UpdateRow = 0x03,
}

/**
 * Supported variable types for debug messages.
 */
export enum DebugVarTypeEnum {
    None = 0,
    Int = 1,
    Float = 2,
    String = 3,
    Bool = 4,
}
export type DebugVarType = number | string | boolean | null;

const AIPPFirstPrefix = 0xfe;
const AIPPContinuationPrefix = 0xff;
const AIPPContinuationPostfix = 0xff;
const AIPPNoContinuationPostfix = 0x00;

const AIPP_MTU = 19; // max size of appdata packet payload

export type DebugMessage =
    | {
          Id: MessageType.DebugNotification;
          subcode: DebugSubCode.StartNotification;
      }
    | {
          Id: MessageType.DebugAcknowledge;
          subcode: DebugSubCode.StartAcknowledge;
          success: boolean;
      }
    | {
          Id: MessageType.DebugNotification;
          subcode: DebugSubCode.TrapNotification;
          filename: string;
          line: number;
          variables?: Map<string, DebugVarType>; // maximum 255 variables
      }
    | {
          Id: MessageType.DebugAcknowledge;
          subcode: DebugSubCode.TrapAcknowledge;
          success: boolean;
      }
    | {
          Id: MessageType.DebugAcknowledge;
          subcode: DebugSubCode.ContinueRequest;
          step: boolean;
      }
    | {
          Id: MessageType.DebugNotification;
          subcode: DebugSubCode.ContinueResponse;
          step: boolean;
      }
    // | {
    //       Id: MessageType.DebugAcknowledge;
    //       subcode: DebugSubCode.EvaluateRequest;
    //       corrid: number;
    //       expression: string;
    //   }
    // | {
    //       Id: MessageType.DebugNotification;
    //       subcode: DebugSubCode.EvaluateResponse;
    //       corrid: number;
    //       //   type: DebugVarTypeEnum;
    //       value: DebugVarType;
    //   }
    | {
          Id: MessageType.DebugAcknowledge;
          subcode: DebugSubCode.SetVariableRequest;
          varname: string;
          //   type: DebugVarTypeEnum;
          value: DebugVarType;
      }
    | {
          Id: MessageType.DebugNotification;
          subcode: DebugSubCode.SetVariableResponse;
          success: boolean;
      }
    | {
          Id: MessageType.DebugAcknowledge;
          subcode: DebugSubCode.TerminateRequest;
      }
    | {
          Id: MessageType.DebugNotification;
          subcode: DebugSubCode.TerminateResponse;
          success: boolean;
      };

export type PlotMessage =
    | {
          Id: MessageType.PlotAcknowledge;
          subcode: PlotSubCode.Ack;
      }
    | {
          Id: MessageType.PlotNotification;
          subcode: PlotSubCode.Define;
          columns: string[];
      }
    | {
          Id: MessageType.PlotNotification;
          subcode: PlotSubCode.UpdateCells;
          values: { name: string; value: number }[];
      }
    | {
          Id: MessageType.PlotNotification;
          subcode: PlotSubCode.UpdateRow;
          values: number[];
      };

export type Message =
    | DebugMessage
    | PlotMessage
    | DeviceNotificationMessage
    | TunnelNotificationMessage;

const MAX_DEBUG_MESSAGE_SIZE = 1024;

/**
 * Computes a simple 8-bit checksum by summing all bytes.
 * The result is modulo 256.
 *
 * @param data The bytes-like object to checksum.
 * @returns The 8-bit checksum (0-255).
 */
function simpleSumChecksum(data: Uint8Array | Buffer): number {
    let checksum = 0;
    for (const byte of data) {
        checksum += byte;
    }
    return checksum & 0xff;
}

/**
 * Encode a debug message (raw, without framing).
 * Returns the raw Uint8Array.
 */
function encodeDebugMessageRaw(data: DebugMessage): Uint8Array {
    const buffer = new Uint8Array(MAX_DEBUG_MESSAGE_SIZE);
    const dataview = new DataViewExtended(buffer, 0, DebugMessageLittleEndian);

    dataview.writeUInt8(data.Id);
    dataview.writeUInt8(data.subcode);

    const encodeValue = (value: DebugVarType, dataview: DataViewExtended) => {
        if (value === null) {
            dataview.writeUInt8(DebugVarTypeEnum.None);
        } else if (typeof value === 'number') {
            if (Number.isInteger(value)) {
                dataview.writeUInt8(DebugVarTypeEnum.Int);
                dataview.writeInt32(value);
            } else {
                dataview.writeUInt8(DebugVarTypeEnum.Float);
                dataview.writeFloat(value);
            }
        } else if (typeof value === 'string') {
            dataview.writeUInt8(DebugVarTypeEnum.String);
            dataview.writeString(value);
        } else if (typeof value === 'boolean') {
            dataview.writeUInt8(DebugVarTypeEnum.Bool);
            dataview.writeBool(value);
        } else {
            dataview.writeUInt8(DebugVarTypeEnum.None);
        }
    };

    switch (data.subcode) {
        case DebugSubCode.StartNotification:
            // nothing to add
            break;

        case DebugSubCode.TrapNotification:
            // filename: zstring, line: uint16
            dataview.writeString(data.filename);
            dataview.writeUInt16(data.line);
            // followed by count: uint8, then (zstring, uint8 type, value) for each variable
            if (data.variables) {
                const vars = Array.from(data.variables.entries());
                dataview.writeUInt8(vars.length);
                for (let i = 0; i < vars.length; i++) {
                    if (i >= 255) break; // max 255 variables
                    const [varname, value] = vars[i];
                    dataview.writeString(varname);
                    encodeValue(value, dataview);
                }
            } else {
                dataview.writeUInt8(0); // zero variables
            }
            break;

        // case DebugSubCode.EvaluateRequest:
        //     // corrid: uint16, expression: zstring
        //     dataview.writeUInt8(data.corrid);
        //     dataview.writeString(data.expression);
        //     break;

        case DebugSubCode.SetVariableResponse:
            // success: boolean
            dataview.writeBool(data.success);
            break;

        // case DebugSubCode.EvaluateResponse:
        //     // corrid: uint16, type: uint8, value: depends on type
        //     dataview.writeUInt8(data.corrid);
        //     encodeValue(data.value, dataview);
        //     break;

        case DebugSubCode.SetVariableRequest:
            // varname: zstring, type: uint8, value: depends on type
            dataview.writeString(data.varname);
            encodeValue(data.value, dataview);
            break;

        case DebugSubCode.StartAcknowledge:
        case DebugSubCode.TrapAcknowledge:
            // success: boolean
            dataview.writeBool(data.success);
            break;

        case DebugSubCode.ContinueRequest:
        case DebugSubCode.ContinueResponse:
            // step: boolean
            dataview.writeBool(data.step);
            break;

        default:
            throw new Error('Unknown debug subcode');
    }

    return buffer.slice(0, dataview.offset);
}

/**
 * Decode a debug message from a raw Uint8Array (no framing).
 * Returns an object with filename, line, and variables.
 */
function decodeDebugMessageRaw(data: Uint8Array): DebugMessage {
    const dataview = new DataViewExtended(data, 0, DebugMessageLittleEndian);
    const msgtype = dataview.readUInt8();
    if (msgtype !== MessageType.DebugNotification)
        throw new Error('Not a debug message');

    const subcode = dataview.readUInt8();

    const decodeValue = (
        dataview: DataViewExtended,
    ): { type: DebugVarTypeEnum; value: DebugVarType } => {
        const type = dataview.readUInt8() as DebugVarTypeEnum;
        let value: DebugVarType = null;
        switch (type) {
            case DebugVarTypeEnum.Int:
                value = dataview.readInt32();
                break;
            case DebugVarTypeEnum.Float:
                value = dataview.readFloat();
                break;
            case DebugVarTypeEnum.String:
                value = dataview.readString();
                break;
            case DebugVarTypeEnum.Bool:
                value = dataview.readBool();
                break;
            case DebugVarTypeEnum.None:
            default:
                value = null;
                break;
        }
        return { type, value };
    };

    switch (subcode) {
        case DebugSubCode.StartNotification:
            return {
                Id: MessageType.DebugNotification,
                subcode: DebugSubCode.StartNotification,
            };
        case DebugSubCode.StartAcknowledge:
            return {
                Id: MessageType.DebugAcknowledge,
                subcode: DebugSubCode.StartAcknowledge,
                success: dataview.readBool(),
            };
        case DebugSubCode.TrapNotification:
            return {
                Id: MessageType.DebugNotification,
                subcode: DebugSubCode.TrapNotification,
                filename: dataview.readString(),
                line: dataview.readUInt16(),
                variables: (() => {
                    const count = dataview.readUInt8();
                    if (count === 0) return undefined;

                    const vars = new Map<string, DebugVarType>();
                    for (let i = 0; i < count; i++) {
                        const varname = dataview.readString();
                        let { value } = decodeValue(dataview);
                        vars.set(varname, value);
                    }
                    return vars;
                })(),
            };
        case DebugSubCode.TrapAcknowledge:
            return {
                Id: MessageType.DebugAcknowledge,
                subcode: DebugSubCode.TrapAcknowledge,
                success: dataview.readBool(),
            };
        case DebugSubCode.ContinueRequest:
            return {
                Id: MessageType.DebugAcknowledge,
                subcode: DebugSubCode.ContinueRequest,
                step: dataview.readBool(),
            };
        case DebugSubCode.ContinueResponse:
            return {
                Id: MessageType.DebugNotification,
                subcode: DebugSubCode.ContinueResponse,
                step: dataview.readBool(),
            };
        // case DebugSubCode.EvaluateRequest:
        //     return {
        //         Id: MessageType.DebugAcknowledge,
        //         subcode: DebugSubCode.EvaluateRequest,
        //         expression: dataview.readString(),
        //         corrid: dataview.readUInt8(),
        //     };
        // case DebugSubCode.EvaluateResponse: {
        //     const corrid = dataview.readUInt8();
        //     let { value } = decodeValue(dataview);
        //     return {
        //         Id: MessageType.DebugNotification,
        //         subcode: DebugSubCode.EvaluateResponse,
        //         corrid,
        //         // type,
        //         value,
        //     };
        // }
        case DebugSubCode.SetVariableRequest: {
            const varname = dataview.readString();
            let { value } = decodeValue(dataview);
            return {
                Id: MessageType.DebugAcknowledge,
                subcode: DebugSubCode.SetVariableRequest,
                varname,
                value,
            };
        }
        case DebugSubCode.SetVariableResponse:
            return {
                Id: MessageType.DebugNotification,
                subcode: DebugSubCode.SetVariableResponse,
                success: dataview.readBool(),
            };
        default:
            throw new Error('Unknown debug subcode');
    }
}
/**
 * Encode a plot message (raw, without framing).
 * @param data
 * @returns The raw Uint8Array.
 */
function encodePlotMessageRaw(data: PlotMessage): Uint8Array {
    const buffer = new Uint8Array(MAX_DEBUG_MESSAGE_SIZE);
    const dataview = new DataViewExtended(buffer, 0, PlotMessageLittleEndian);

    dataview.writeUInt8(data.Id);
    dataview.writeUInt8(data.subcode);

    switch (data.subcode) {
        case PlotSubCode.Ack:
            // nothing to add
            break;

        case PlotSubCode.Define: {
            // columns: uint8 count, then zstring for each
            const count = Math.min(data.columns.length, 255); // max 255 columns
            dataview.writeUInt8(count);
            for (let i = 0; i < count; i++) {
                const col = data.columns[i];
                dataview.writeString(col);
            }
            break;
        }

        case PlotSubCode.UpdateCells: {
            // values: uint8 count, then (zstring, float) for each
            const count = Math.min(data.values.length, 255); // max 255 columns
            dataview.writeUInt8(count);
            for (let i = 0; i < count; i++) {
                const v = data.values[i];
                dataview.writeString(v.name);
                dataview.writeFloat(v.value);
            }
            break;
        }

        case PlotSubCode.UpdateRow: {
            // values: uint8 count, then float for each
            const count = Math.min(data.values.length, 255); // max 255 columns
            for (let i = 0; i < count; i++) {
                const v = data.values[i];
                dataview.writeFloat(v);
            }
            break;
        }

        default:
            throw new Error('Unknown plot subcode');
    }

    return buffer.slice(0, dataview.offset);
}

/**
 * Decode a plot message from a raw Uint8Array (no framing).
 * Returns an object with columns and values.
 */
function decodePlotMessageRaw(data: Uint8Array): PlotMessage {
    const dataview = new DataViewExtended(data, 0, PlotMessageLittleEndian);
    const msgtype = dataview.readUInt8();
    if (msgtype !== MessageType.PlotNotification) throw new Error('Not a plot message');

    const subcode = dataview.readUInt8();

    switch (subcode) {
        case PlotSubCode.Ack:
            return {
                Id: MessageType.PlotAcknowledge,
                subcode: PlotSubCode.Ack,
            };
        case PlotSubCode.Define: {
            const count = dataview.readUInt8();
            const columns: string[] = [];
            for (let i = 0; i < count; i++) {
                columns.push(dataview.readString());
            }
            return {
                Id: MessageType.PlotNotification,
                subcode: PlotSubCode.Define,
                columns,
            };
        }
        case PlotSubCode.UpdateCells: {
            const count = dataview.readUInt8();
            const values: { name: string; value: number }[] = [];
            for (let i = 0; i < count; i++) {
                const name = dataview.readString();
                const value = dataview.readFloat();
                values.push({ name, value });
            }
            return {
                Id: MessageType.PlotNotification,
                subcode: PlotSubCode.UpdateCells,
                values,
            };
        }
        case PlotSubCode.UpdateRow: {
            const count = dataview.readUInt8();
            const values: number[] = [];
            for (let i = 0; i < count; i++) {
                values.push(dataview.readFloat());
            }
            return {
                Id: MessageType.PlotNotification,
                subcode: PlotSubCode.UpdateRow,
                values,
            };
        }
        default:
            throw new Error('Unknown plot subcode');
    }
}

/**
 * Encode a Pybricks Instrumentation Protocol (PIP) message to a raw Uint8Array (no framing).
 * Returns the raw Uint8Array.
 */
export function encodeMessageRaw(message: Message): Uint8Array {
    switch (message.Id) {
        case MessageType.DebugAcknowledge:
            return encodeDebugMessageRaw(message as DebugMessage);
        case MessageType.PlotAcknowledge:
            return encodePlotMessageRaw(message as PlotMessage);
        case MessageType.DeviceNotification:
            // TODO: consider implementing
            throw new Error('Cannot encode device notification message');
        case MessageType.TunnelNotification:
            return (message as TunnelRequestMessage).serialize();
        default:
            throw new Error('Unknown message type');
    }
}

/**
 * Decode a Pybricks Instrumentation Protocol (PIP) message from a raw Uint8Array (no framing).
 */
export function decodeMessageRaw(data: Uint8Array): Message {
    const msgtype = data[0];
    switch (msgtype) {
        case MessageType.DebugNotification:
            return decodeDebugMessageRaw(data);
        case MessageType.PlotNotification:
            return decodePlotMessageRaw(data);
        case MessageType.DeviceNotification:
            return DeviceNotificationMessage.fromBytes(data);
        case MessageType.TunnelNotification:
            return TunnelNotificationMessage.fromBytes(
                data,
            ) as TunnelNotificationMessage;
        default:
            throw new Error('Unknown message type');
    }
}

export class AppDataInstrumentationPybricksProtocol {
    private static packageid = 0;
    public static encode(payload: Message): ArrayBuffer[] {
        const encoded0 = encodeMessageRaw(payload);

        // appdata receiver channel cannot receive the same message twice in a row, extend the buffer and add package number as an unused field at the end
        this.packageid = (this.packageid + 1) & 0xff;
        const encoded0WithPackageId = Buffer.from([...encoded0, this.packageid]);

        // checksum will be aligned to the last(-1) byte of the buffer
        const checksum = simpleSumChecksum(encoded0WithPackageId);
        // placeholder for checksum, will be aligned to the last payload byte of the last packet
        const encoded1 = Buffer.from([...encoded0WithPackageId, 0x00]);
        // logDebug(`AppDataInstrumentationPybricksProtocol encoded message: ${encoded1.toString(
        //     'hex',
        // )} with checksum ${checksum.toString(16)}`);

        // split into chunks of MTU size (AIPP_MTU)
        const chunks: ArrayBuffer[] = [];
        const maxPacketSize = AIPP_MTU - 2;
        for (let i = 0; i < encoded1.length; i += maxPacketSize) {
            const firstPacket = i === 0;
            // const packet_size = Math.min(maxPacketSize, encoded1.length - i);
            const packet_size = maxPacketSize; // always send full size packets
            let chunk = encoded1.subarray(i, i + packet_size);
            const isLastChunk = i + packet_size >= encoded1.length;

            // enlarge last chunk to full size with zeros
            if (isLastChunk) {
                // pad with zeros and set checksum at the last byte
                chunk = Buffer.concat([
                    chunk,
                    Buffer.alloc(packet_size - chunk.length),
                ]);
                // set checksum aligned to last byte of the last chunk
                chunk[chunk.length - 1] = checksum;
            }

            const chunk_framed = Buffer.from([
                firstPacket ? AIPPFirstPrefix : AIPPContinuationPrefix,
                ...chunk,
                isLastChunk ? AIPPNoContinuationPostfix : AIPPContinuationPostfix,
            ]);

            chunks.push(
                chunk_framed.buffer.slice(
                    chunk_framed.byteOffset,
                    chunk_framed.byteOffset + chunk_framed.byteLength,
                ),
            );
        }
        return chunks;
    }

    static appDataBuffer: Uint8Array = Buffer.alloc(0); // buffer for assembling appdata packets
    public static reset() {
        this.appDataBuffer = Buffer.alloc(0);
    }

    public static async decode(data: Uint8Array): Promise<ArrayBuffer | undefined> {
        let buffer: Uint8Array;
        const isFirstPacket = data[0] === 0xfe;
        const hasContinuation = data[data.length - 1] === 0xff;
        data = data.subarray(1, data.length - 1);

        //-- assemble packets
        if (isFirstPacket && this.appDataBuffer.length > 0) {
            console.error('Received new appdata while previous incomplete');
            this.appDataBuffer = data;
        }
        if (!isFirstPacket && this.appDataBuffer.length === 0) {
            console.error('Received continuation appdata without previous data');
            return; // ignore
        }

        // append data to buffer
        this.appDataBuffer = Buffer.concat([this.appDataBuffer, data]);

        // wait for more data if continuation
        if (hasContinuation) {
            return; // wait for more data
        }

        //-- last packet - complete message
        // process complete chunks
        // logDebug(
        //     `AppData complete message received: ${bufferToHexString(
        //         this.appDataBuffer,
        //     )}`,
        // );
        buffer = this.appDataBuffer.slice(0, this.appDataBuffer.length - 1);
        const checksum = data[data.length - 1];
        this.appDataBuffer = Buffer.alloc(0); // reset buffer

        if (simpleSumChecksum(buffer) !== checksum) {
            console.error(
                'App data checksum mismatch',
                simpleSumChecksum(buffer),
                checksum,
            );
            throw new Error('App data checksum mismatch');
        }

        //-- decode incoming message
        const message = decodeMessageRaw(buffer);
        const msgtype = buffer[0];
        switch (msgtype) {
            case MessageType.DebugNotification: {
                await handleIncomingAIPPDebug(message as DebugMessage);
                break;
            }
            case MessageType.PlotNotification: {
                await handleIncomingAIPPPlot(message as PlotMessage);
                break;
            }
            case MessageType.DeviceNotification: {
                const devmsg = message as DeviceNotificationMessage;
                await handleDeviceNotificationAsync(devmsg.payloads);
                break;
            }
            // case MessageType.TunnelNotification: {
            //     const tunmsg = message as TunnelNotificationMessage;
            //     console.debug(`Appdata tunnel notification: ${tunmsg.toString()}`);
            //     break;
            // }
            default:
                console.error('Unknown appdata message type', msgtype);
                break;
        }

        return undefined;
    }
}
async function handleIncomingAIPPPlot(arg0: PlotMessage) {
    const message = arg0;

    switch (message.subcode) {
        case PlotSubCode.Define:
            await plotManager.resetPlotParser();
            plotManager.addColumns(message.columns);
            break;
        case PlotSubCode.UpdateCells:
            plotManager.setCellRow(message.values);
            break;
        case PlotSubCode.UpdateRow:
            plotManager.setRowValues(message.values);
            break;
    }
}
