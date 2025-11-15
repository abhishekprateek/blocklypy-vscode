"""
AIPP: AppData Instrumentation Protocol for Pybricks
A minimal implementation for MicroPython on Pybricks hubs.

"""
from pybricks.parameters import Button
from pybricks.hubs import ThisHub
from pybricks.tools import AppData, wait
from ustruct import pack, unpack
from micropython import const

# https://docs.micropython.org/en/latest/develop/optimizations.html
# optimized version: 2946 bytes

# ------------------------------
# region AIPP Tunnel Handling
# max bytes per packet including header (receive MTU, send MTU is )
_APPDATA_MTU = const(19)
_MAX_COUNT_VALUES = const(255)


def _format_bytes(data: bytes, hex: bool = True) -> str:  # !!
    fmt = '{:02x} ' if hex else '{:03} '
    return ''.join(fmt.format(b) for b in data)


# def simple_sum_checksum(data: bytes) -> int:
#     """
#     Computes a simple 8-bit checksum by summing all bytes.
#     The result is modulo 256.

#     :param data: The bytes-like object to checksum.
#     :return: The 8-bit checksum (0-255).
#     """
#     return sum(data) & 0xFF


def send_tunnel_aipp(data: bytes):
    # frame with start byte, data, checksum, end byte
    # split into chunks of MTU size with continuation bytes
    # start byte: 0xFE
    # continuation byte: 0xFF
    # end byte: 0x00
    # checksum: sum of all data bytes modulo 256

    # inlined simple_sum_checksum
    # data += bytes([simple_sum_checksum(data)])
    data += bytes([sum(data) & 0xFF])

    # print("sending data", _format_bytes(data)) # !!
    offset = 0
    while offset < len(data):
        n = min(_APPDATA_MTU-2, len(data)-offset)
        isfirst = offset == 0
        islast = offset+n >= len(data)
        chunk = (b'\xfe' if isfirst else b'\xff') + \
            data[offset:offset+n] + \
            (b'\x00' if islast else b'\xff')
        try:
            appdata.write_bytes(chunk)
        except:
            # raise e # !!
            pass
        offset += n


def decode_tunnel(chunks: list[bytes]) -> bytes:
    """Assembles a list of byte chunks into a single bytes object.
    If a chunk ends with 0xFF, it indicates more chunks follow.
    Chunk starts with 0xFE for first, then 0xFF.
    The last chunk ends with checksum byte and 0x00.
    """
    # Accept both bytes and list-of-bytes, but avoid wrapping unnecessarily
    if isinstance(chunks, bytes):
        # single chunk, treat as list of one
        chunks = (chunks,)  # comma is important as it will enforce the tuple
    message = bytearray()
    for index, chunk in enumerate(chunks):
        # print(_format_bytes(chunk), " | ", len(chunk))  # !!
        # or chunk[-1] not in (0x00, 0xFF):
        if chunk[0] != (0xFE if index == 0 else 0xFF):
            # print("error", 1, chunk[0], index) # !!
            return b''  # ignore invalid array of chunks
        # if chunk[0] != (0xFE if i == 0 else 0xFF) or chunk[-1] not in (0x00, 0xFF):
        #     raise ValueError()
        is_last = chunk[-1] == 0x00
        # Remove leading 0xFE/0xFF if present (continuation marker)
        # Remove trailing 0xFF or 0x00 (continuation or end marker)
        chunk = chunk[1:-1]
        message.extend(chunk)
        if is_last:
            break
    if len(message) < 1:
        # print("error", 2) # !!
        return b''
    data = message[:-1]
    checksum = message[-1]
    # checksum decoding is problematic; either align to the end (-1 for continuation) or rework checksum
    # inlined simple_sum_checksum
    # if simple_sum_checksum(data) != checksum:
    #     raise ValueError()
    if sum(data) & 0xFF != checksum:
        # print("error", 3, hex(sum(data) & 0xFF), hex(checksum)) # !!
        raise b''
    return bytes(data)

# endregion AIPP Tunnel Handling
# ------------------------------

# ------------------------------
# region AIPP Protocol handling


# Replace class constants
_DEBUG_ACKNOWLEDGE = const(0x70)
_DEBUG_NOTIFICATION = const(0x71)
_PLOT_ACKNOWLEDGE = const(0x72)
_PLOT_NOTIFICATION = const(0x73)

_DEBUG_START_ACK = const(0x00)
_DEBUG_START_NOTIF = const(0x01)
_DEBUG_TRAP_ACK = const(0x02)
_DEBUG_TRAP_NOTIF = const(0x03)
_DEBUG_CONTINUE_REQ = const(0x04)
_DEBUG_CONTINUE_RESP = const(0x05)
# _DEBUG_EVAL_REQ = const(0x06)
# _DEBUG_EVAL_RESP = const(0x07)
_DEBUG_SETVAR_REQ = const(0x08)
_DEBUG_SETVAR_RESP = const(0x09)
_DEBUG_TERM_REQ = const(0x0a)
_DEBUG_TERM_RESP = const(0x0b)

_PLOT_ACK = const(0x00)
_PLOT_DEFINE = const(0x01)
_PLOT_UPDATE_CELLS = const(0x02)
_PLOT_UPDATE_ROW = const(0x03)

_VAR_NONE = const(0x00)
_VAR_INT = const(0x01)
_VAR_FLOAT = const(0x02)
_VAR_STRING = const(0x03)
_VAR_BOOL = const(0x04)

_DAP_TUNNEL_WAIT = const(100)                      # wait time per loop (ms)
# active wait time per loop for continuation (ms)
_DAP_TUNNEL_CONTINUATION_WAIT = const(10)
_DAP_TIMEOUT = const(100)                          # full (100ms) cycles
# resend every n loops # to be checked/validated
_DAP_REPEAT_COUNT = const(30)                      # x * _DAP_TUNNEL_WAIT ms


def encode_zstring(s: str) -> bytes:
    """Encodes a zero-terminated string."""
    return bytes(s, 'utf-8') + b'\x00' if isinstance(s, str) else b'\x00'


def decode_zstring(data: bytes, start_idx: int) -> tuple:  # tuple(str, int)
    """Decodes a zero-terminated byte string from data starting at start_idx."""
    s = []
    idx = start_idx
    while idx < len(data) and data[idx] != 0:
        s.append(chr(data[idx]))
        idx += 1
    idx += 1  # skip zero terminator
    return ''.join(s), idx


# def receive_tunnel():
#     global appdata_last_data
#     try:
#         data = appdata.get_bytes()
#         if len(data) == 0 or data[0] == 0 or \
#                 data[:APPDATA_MTU] == appdata_last_data[:APPDATA_MTU]:
#             return None, None
#         appdata_last_data = data
#         decoded = decode_tunnel(data)
#         # TODO: only react on full frames!
#         msgtype, message = decode_message_raw(decoded)
#         # should somehow reset the buffer - appdata.reset()
#         return msgtype, message
#     except Exception as e:
#         # print(e)
#         # raise e
#         return type(None), None


def decode_message_raw(data: list[bytes]):
    if len(data) < 2:
        raise ValueError()  # "Data too short to decode"
    msg_type = data[0]
    # print("decode_message_raw", msg_type, data, _DEBUG_ACKNOWLEDGE) # !!
    if msg_type == _DEBUG_ACKNOWLEDGE:
        return (msg_type, decode_debug_message_raw(data))
    # elif msg_type == PLOT_ACKNOWLEDGE:
    #     return (msg_type, True)
    return (None, None)


# plot_columns = []


# def encode_plot_message_raw(message) -> bytes:
#     subcode = message[0]
#     parts = bytearray()
#     parts.append(PLOT_NOTIFICATION)
#     parts.append(subcode)

#     if subcode == PLOT_UPDATE_CELLS:
#         # [name, value]
#         plotdata = message[1][:MAX_COUNT_VALUES]  # max 255 columns
#         parts.append(len(plotdata))  # count
#         for name, value in plotdata:
#             parts += encode_zstring(name)  # name
#             parts += pack('<f', value)  # always float
#             if not name in plot_columns:
#                 plot_columns.append(name)

#     elif subcode == PLOT_UPDATE_ROW:
#         # [value]
#         values = message[1][:MAX_COUNT_VALUES]  # max 255 columns
#         values = values[0:len(plot_columns)]  # truncate to known columns
#         parts.append(len(values))
#         for value in values:
#             parts += pack('<f', value)

#     elif subcode == PLOT_DEFINE:
#         # [name]
#         names = message[1][:MAX_COUNT_VALUES]  # max 255 columns
#         parts.append(len(names))
#         for name in names:
#             parts += encode_zstring(name)
#             if not name in plot_columns:
#                 plot_columns.append(name)

#     return bytes(parts)


# def encode_debug_value(v) -> tuple:  # tuple(int, bytes)
#     if isinstance(v, int):
#         vartype = _VAR_INT
#         data = pack('<i', v)
#     elif isinstance(v, float):
#         vartype = _VAR_FLOAT
#         data = pack('<f', v)
#     elif isinstance(v, str):
#         vartype = _VAR_STRING
#         data = encode_zstring(v)
#     elif isinstance(v, bool):
#         vartype = _VAR_BOOL
#         data = bytes([1 if v else 0])
#     elif v is None:
#         vartype = _VAR_NONE
#         data = b''
#     else:  # v is some format we do not want to handle
#         vartype = None
#         data = b''
#     return vartype, data
    
def encode_debug_message_raw(message) -> bytes:
    """
    Encodes a debug message from pc to hub/me.
    message: list format depends on subcode:
    """
    parts = bytearray()
    parts.append(_DEBUG_NOTIFICATION)
    subcode = message[0]
    rest = message[1:]
    parts.append(subcode)
    # if subcode == DEBUG_START_NOTIF: # nothing to add
    # if subcode == DEBUG_CONTINUE_RESP: # nothing to add
    # if subcode == DEBUG_TERM_RESP: # nothing to add
    if subcode == _DEBUG_TRAP_NOTIF:
        # trap: filename, line, variables
        filename, line, exposed_keys, exposed_values = rest
        parts += encode_zstring(filename)
        parts += pack('<H', line)
        counter_position = len(parts)
        parts.append(0)  # remember counter
        for i in range(len(exposed_keys)):
            exposed_var = exposed_keys[i]
            v = exposed_values[i]
            if isinstance(v, int):
                vartype = _VAR_INT
                data = pack('<i', v)
            elif isinstance(v, float):
                vartype = _VAR_FLOAT
                data = pack('<f', v)
            elif isinstance(v, str):
                vartype = _VAR_STRING
                data = encode_zstring(v)
            elif isinstance(v, bool):
                vartype = _VAR_BOOL
                data = bytes([1 if v else 0])
            elif v is None:
                vartype = _VAR_NONE
                data = b''
            else:  # v is some format we do not want to handle
                continue
            # vartype, data = encode_debug_value(v)
            # if vartype is None:
            #     continue
            parts[counter_position] += 1
            parts += encode_zstring(exposed_var)
            parts.append(vartype)
            parts += data
            if parts[counter_position] >= _MAX_COUNT_VALUES:  # max 256 variables
                break

    # elif subcode == _DEBUG_EVAL_RESP:
    #     # get variable response: name, varvalue
    #     corrid, varvalue = rest
    #     vartype, data = encode_debug_value(varvalue)
    #     if not vartype is None:
    #         parts.append(corrid)
    #         parts.append(vartype)
    #         parts += data

    elif subcode == _DEBUG_SETVAR_RESP:
        # set variable response: error message
        [error_msg] = rest
        parts += encode_zstring(error_msg)

    return bytes(parts)


def decode_debug_message_raw(data: list[bytes]):
    """
    Decodes a debug message from hub/me to pc.
    Returns a list or tuple, format depends on subcode
    """
    # If data is a list of bytes chunks, assemble into a single bytes object
    if len(data) < 3:
        raise ValueError()
    subcode = data[1]
    rest = data[2:]
    # print("Appdata complete message received:", _format_bytes(data))  # !!
    if subcode == _DEBUG_START_ACK:
        # start ack: success in connect to debugger
        success = rest[0] != 0
        return (subcode, success)
    elif subcode == _DEBUG_TRAP_ACK:
        # trap ack: success
        success = rest[0] != 0
        return (subcode, success)
    elif subcode == _DEBUG_CONTINUE_REQ:
        # trap ack: continue/exit_debug
        step = rest[0] != 0
        return (subcode, step)
    # elif subcode == _DEBUG_EVAL_REQ:
    #     # get evaluate request: corrid, expression
    #     corrid = rest[0]
    #     expr, _ = decode_zstring(rest, 1)
    #     return (subcode, corrid, expr)
    elif subcode == _DEBUG_SETVAR_REQ:
        # set variable request: name, vartype, varvalue
        name, index = decode_zstring(rest, 0)
        vartype = rest[index]
        varvalue_data = rest[index + 1:]
        varvalue = None
        if vartype == _VAR_INT and len(varvalue_data) >= 4:
            varvalue = unpack('<i', varvalue_data[:4])[0]
        elif vartype == _VAR_FLOAT and len(varvalue_data) >= 4:
            varvalue = unpack('<f', varvalue_data[:4])[0]
        elif vartype == _VAR_BOOL:
            varvalue = varvalue_data[0] != 0
        elif vartype == _VAR_STRING:
            varvalue, index = decode_zstring(varvalue_data, 0)
        # elif vartype == VAR_NONE:
        #     varvalue = None
        # index increments - not needed as we only set one variable here
        return (subcode, name, vartype, varvalue)
    elif subcode == _DEBUG_TERM_REQ:
        return (subcode)


# endregion AIPP Protocol handling
# ------------------------------

# ------------------------------
# region AIPP Debugger Tunnel Waiting

appdata = AppData('<BBBBBBBBBBBBBBBBBBB')  # 19*B
appdata_last_data = b''
# todo add init appdata, for now - ignore user created AppData

hub = ThisHub()


def tunnel_wait(expected: list, message_to_send: bytes = None, timeout: int = -1) -> tuple:  # tuple(number, list)
    # print("tunnel_wait", expected, timeout) # !!

    global appdata_last_data
    # target_message_type -> lambda / or subcode
    timer = 0
    chunks = []
    while True:
        # msgtype, message = receive_tunnel()
        # inlined - receive_tunnel
        msgtype, message = None, None
        try:
            data = appdata.get_bytes()
            # if len(data) > 0 and data[0] != 0x00 and \
            #         data[:APPDATA_MTU] != appdata_last_data[:APPDATA_MTU]:
            # if data[:_APPDATA_MTU] != appdata_last_data[:_APPDATA_MTU]:
            #     print("received data", _format_bytes(data), chunks)  # !!
            if len(data) > 0 and \
                    data[:_APPDATA_MTU] != appdata_last_data[:_APPDATA_MTU] and \
                    data[0] in (0xFE, 0xFF) and data[-1] in (0x00, 0xFF):
                appdata_last_data = data
                # start decoding once we receive a completion (last byte is 0x00)
                chunks.append(data)
                if data[-1] == 0x00:
                    decoded = decode_tunnel(chunks)
                    # print("decoded", decoded) # !!
                    # TODO: only react on full frames!
                    # should somehow reset the buffer - appdata.reset()
                    msgtype, message = decode_message_raw(decoded)
                elif data[-1] != 0xFF:
                    chunks = []
        except:
            # raise e # !!
            # return type(None), None
            # msgtype, message = type(None), None
            pass

        # matching mesage received, note: this only handles msgtype and subcode - should be ok
        # print("tunnel_wait received", msgtype, message) # !!
        if not message is None:
            if not isinstance(expected, (list, tuple)) or \
                    len(expected) <= 1 or message[0] == expected[1] or expected[1] is None:
                # print("tunnel_wait returning", msgtype, message) # !!
                return msgtype, message

        if (not message_to_send is None) and (timer % _DAP_REPEAT_COUNT == 0):
            # print("tunnel_wait sending", _format_bytes(message_to_send)) # !!
            send_tunnel_aipp(message_to_send)

        timer += 1

        # would need to detect ans safeguard disconnect - hub.info() is not updated though
        # try:
        #     if _hub.info()['host_connected_ble'] == False:
        #         return None, None
        # except: pass

        # allow manual trigger to continue
        try:
            if Button.BLUETOOTH in hub.buttons.pressed():
                while Button.BLUETOOTH in hub.buttons.pressed():
                    # this is blocking, but ok for now
                    wait(0)
                # print("tunnel_wait manual continue") # !!
                return None, None
        except:
            pass

        # timeout handling
        if timeout >= 0 and timer > timeout:
            # print("tunnel_wait timeout") # !!
            return None, None

        # wait a bit to avoid busy loop
        wait(_DAP_TUNNEL_WAIT if data[-1] !=
             0xFF else _DAP_TUNNEL_CONTINUATION_WAIT)


# endregion AIPP Debugger Tunnel Waiting
# ------------------------------

# ------------------------------
# region AIPP Debugger Class

initialized = False
handshaken = False


def debug_tunnel_init():
    global initialized, handshaken, hub
    if initialized:
        return handshaken
    try:
        start_type = hub.system.info().get('program_start_type')
        # Only enable when downloaded from PC (start_type == 3)
        if start_type != 3:
            return False

        initialized = True
        handshaken = debug_tunnel_start_handshake()
    except:
        # raise e  # !!
        initialized = False
        handshaken = False
    return handshaken


def debug_tunnel_start_handshake():
    # print("Waiting for debugger start acknowledge") # !!
    # send_tunnel_aipp(encode_debug_message_raw([DEBUG_START_NOTIF]))
    response_msgtype, response_msg = debug_tunnel_channel_wait(_DEBUG_START_ACK,
                                                               encode_debug_message_raw(
                                                                   [_DEBUG_START_NOTIF]),
                                                               _DAP_TIMEOUT, True)
    if response_msg is None or not response_msg[1]:
        # nack for Init
        # print("Server negatively acknowledged debugger start") # !!
        retval = False
    else:
        retval = True
        # print("Server acknowledged debugger start") # !!

    # cls._silent = result[0] != "True"
    return retval


# @classmethod
# def _hub_feedback(cls, state):
#     """
#     state: None (prompt), True (success), False (fail)
#     """
#     try:
#         hub = cls._hub

#         if cls._silent:
#             return
#         hub.speaker.volume(40)
#         if state is None:
#             hub.speaker.play_notes(['E4/4', 'G4/4', 'B4/2'], 2000)
#         elif state is True:
#             hub.speaker.play_notes(['G4/4', 'C5/4'], 2000)
#         else:
#             hub.speaker.play_notes(
#                 ['A4/8', 'F4/8', 'D4/4', 'R/8', 'D3/4'], 2000)
#     except Exception as e:
#         # print(e)
#         pass


def debug_tunnel_channel_wait(target_message_subcode=None, message_to_send=None, timeout: int = -1, allow_unhandshaken=False) -> tuple:  # tuple(number, list)
    """
    Wait for a control line.
    Returns:
      True  -> ack received
      False -> exit or failure
    """
    global initialized, handshaken, hub
    if not (initialized and (handshaken or allow_unhandshaken)):
        return None, None
    # cls._hub_feedback(None)  # prompt
    # TODO: handle TerminateRequest
    return tunnel_wait((_DEBUG_ACKNOWLEDGE, target_message_subcode), message_to_send, timeout)


def dt_trap(file: str, lineno: int, exposed_keys: tuple, exposed_values: list):
    """
    Trap execution point for interactive update.
    file, lineno used for host context.
    variables: locals() dict (mutable)
    exposed: whitelist of variable names and values in a tuple allowed to be set.
    """
    global handshaken, initialized, hub
    if not (initialized and handshaken):
        return exposed_values

    # Display current line on hub display
    try:
        hub.display.number(lineno)  # show line number on hub display
    except:
        pass

    # Send Trap Notification to the host
    # print("Waiting for server acknowledg of trap notification") # !!
    # cache = MAX_COUNT_VALUES  # ___ need this for minification
    # zipped = list(exposed.items())
    msg = encode_debug_message_raw(
        [_DEBUG_TRAP_NOTIF, file, lineno, exposed_keys, exposed_values])
    _msgtype, response = debug_tunnel_channel_wait(
        _DEBUG_TRAP_ACK, msg, _DAP_TIMEOUT)
    if not response:
        # nack for Trap - continue
        return exposed_values
    # print("Server acknowledged trap notification") # !!

    # Wait for user interaction / continue
    # print("Waiting for Trap continue request") # !!
    while True:
        _msgtype, response = debug_tunnel_channel_wait()  # wait indefinitely, no timeout
        subcode = response[0] if (isinstance(
            response, (list, tuple))) else None
        # print("Server sent trap request", _msgtype, response, subcode) # !!

        if subcode == _DEBUG_CONTINUE_REQ:
            step = response[1] != 0
            # if not response is None and not response[1]:
            #     # step = True, continue = False
            #     # nothing to do with this now...
            send_tunnel_aipp(encode_debug_message_raw(
                [_DEBUG_CONTINUE_RESP, step]))
            # exit the trap loop
            break

        elif subcode == _DEBUG_SETVAR_REQ:
            varname, vartype, varvalue = response[1:4]

            # check if exists
            index = exposed_keys.index(varname)
            result = index >= 0
            if result:
                exposed_values[index] = varvalue

            send_tunnel_aipp(encode_debug_message_raw(
                [_DEBUG_SETVAR_RESP, result]))
            # continue the trap loop
            
        # elif subcode == _DEBUG_EVAL_REQ:
        #     corrid, expression = response[1:3]
        #     result = None
        #     try:
        #         # evaluate in the context of exposed variables
        #         local_context = {}
        #         for i in range(len(exposed_keys)):
        #             local_context[exposed_keys[i]] = exposed_values[i]
        #         result = eval(expression, globals(), local_context)
        #         print("Evaluated expression:", expression, "->", result)  # !!
        #     except Exception as e:
        #         print("Evaluation failed:", expression, "->", e)  # !!
        #         result = None  # evaluation failed

        #     send_tunnel_aipp(encode_debug_message_raw(
        #         [_DEBUG_EVAL_RESP, corrid, result]))
        #     # continue the trap loop

        elif subcode == _DEBUG_TERM_REQ:
            # nothing to send
            # exit the trap loop
            break

        elif subcode == None:
            # this means a manual trigger (e.g. button) was given to continue
            # print("Manual continue from trap") # !!
            step = True
            send_tunnel_aipp(encode_debug_message_raw(
                [_DEBUG_CONTINUE_RESP, step]))

            # exit the trap loop
            break

    # print("Server Sent trap continue") # !!
    return exposed_values


# auto start debug tunnel
# print("Starting debug tunnel on AIPP.") # !!
debug_tunnel_init()

# endregion AIPP Debugger Class
# ------------------------------


# ------------------------------
# region Example local usage
# var1=1
# var2=3.1415
# str1="hello"
# bool1=True
# none1=None
# debug_tunnel._handshaken = True
# # [var1, var2, str1, bool1, none1] = dt_trap('dummy.py', 42, var1=var1, var2=var2, str1=str1, bool1=bool1, none1=none1)
# # [var1, var2, str1, bool1, none1] = dt_trap('dummy.py', 42, {'var1':var1, 'var2':var2, 'str1':str1, 'bool1':bool1, 'none1':none1})
# # dummy = simple_sum_checksum('dummy.py') -> CRC32 -> b'\x78\x19\x15\x4e'
# # [var1, var2, str1, bool1, none1] = dt_trap('dummy.py', 42, ['var1', 'var2', 'str1', 'bool1', 'none1'], [var1, var2, str1, bool1, none1])
# print(var1)

# send_tunnel_aipp(encode_plot_message_raw([PLOT_DEFINE, ['col1', 'col2']]))
# wait(100)
# for i in range(100):
#     send_tunnel_aipp(encode_plot_message_raw([PLOT_UPDATE_ROW, [1+i, 34324/(i+1)]]))
#     wait(100)


# endregion Example local usage
# ------------------------------

"""
MINIFICATION

python -m python_minifier --remove-literal-statements --preserve-globals dt_trap --remove-class-attribute-annotations  --rename-globals dap_aipp_full.py --output dap_aipp_min.py
dap_aipp_full.py

then:
minify all function definition parameters on each def and also modify related body code
"""
