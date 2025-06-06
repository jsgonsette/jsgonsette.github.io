// load wasm module and link with gl functions
//
// this file was made by tons of hacks from emscripten's parseTools and library_webgl
// https://github.com/emscripten-core/emscripten/blob/master/src/parseTools.js
// https://github.com/emscripten-core/emscripten/blob/master/src/library_webgl.js
//
// TODO: split to gl.js and loader.js

"use strict";

const version = 2;

const canvas = document.querySelector("#glcanvas");
var gl;

var clipboard = null;

var plugins = [];
var wasm_memory;
var animation_frame_timeout;

var high_dpi = false;
// if true, requestAnimationFrame will only be called from "schedule_update"
// if false, requestAnimationFrame will be called at the end of each frame
var blocking_event_loop = false;

function init_webgl(version) {
    if (version == 1) {
        gl = canvas.getContext("webgl2");

        function acquireVertexArrayObjectExtension(ctx) {
            // Extension available in WebGL 1 from Firefox 25 and WebKit 536.28/desktop Safari 6.0.3 onwards. Core feature in WebGL 2.
            var ext = ctx.getExtension('OES_vertex_array_object');
            if (ext) {
                ctx['createVertexArray'] = function () { return ext['createVertexArrayOES'](); };
                ctx['deleteVertexArray'] = function (vao) { ext['deleteVertexArrayOES'](vao); };
                ctx['bindVertexArray'] = function (vao) { ext['bindVertexArrayOES'](vao); };
                ctx['isVertexArray'] = function (vao) { return ext['isVertexArrayOES'](vao); };
            }
            else {
                //alert("Unable to get OES_vertex_array_object extension");
            }
        }


        function acquireInstancedArraysExtension(ctx) {
            // Extension available in WebGL 1 from Firefox 26 and Google Chrome 30 onwards. Core feature in WebGL 2.
            var ext = ctx.getExtension('ANGLE_instanced_arrays');
            if (ext) {
                ctx['vertexAttribDivisor'] = function (index, divisor) { ext['vertexAttribDivisorANGLE'](index, divisor); };
                ctx['drawArraysInstanced'] = function (mode, first, count, primcount) { ext['drawArraysInstancedANGLE'](mode, first, count, primcount); };
                ctx['drawElementsInstanced'] = function (mode, count, type, indices, primcount) { ext['drawElementsInstancedANGLE'](mode, count, type, indices, primcount); };
            }
        }

        function acquireDisjointTimerQueryExtension(ctx) {
            var ext = ctx.getExtension('EXT_disjoint_timer_query');
            if (ext) {
                ctx['createQuery'] = function () { return ext['createQueryEXT'](); };
                ctx['beginQuery'] = function (target, query) { return ext['beginQueryEXT'](target, query); };
                ctx['endQuery'] = function (target) { return ext['endQueryEXT'](target); };
                ctx['deleteQuery'] = function (query) { ext['deleteQueryEXT'](query); };
                ctx['getQueryObject'] = function (query, pname) { return ext['getQueryObjectEXT'](query, pname); };
            }
        }

        function acquireDrawBuffers(ctx) {
            var ext = ctx.getExtension('WEBGL_draw_buffers');
            if (ext) {
                ctx['drawBuffers'] = function (bufs) { return ext['drawBuffersWEBGL'](bufs); };
            }
        }

        try {
            gl.getExtension("EXT_shader_texture_lod");
            gl.getExtension("OES_standard_derivatives");
        } catch (e) {
            console.warn(e);
        }

        acquireVertexArrayObjectExtension(gl);
        acquireInstancedArraysExtension(gl);
        acquireDisjointTimerQueryExtension(gl);
        acquireDrawBuffers(gl);

        // https://developer.mozilla.org/en-US/docs/Web/API/WEBGL_depth_texture
        if (gl.getExtension('WEBGL_depth_texture') == null) {
            //alert("Cant initialize WEBGL_depth_texture extension");
        }
    } else {
        gl = canvas.getContext("webgl2");
    }
    if (gl === null) {
        alert("Unable to initialize WebGL. Your browser or machine may not support it.");
    }
}

canvas.focus();

canvas.requestPointerLock = canvas.requestPointerLock ||
    canvas.mozRequestPointerLock ||
    // pointer lock in any form is not supported on iOS safari 
    // https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API#browser_compatibility
    (function () { });
document.exitPointerLock = document.exitPointerLock ||
    document.mozExitPointerLock ||
    // pointer lock in any form is not supported on iOS safari
    (function () { });

function assert(flag, message) {
    if (flag == false) {
        alert(message)
    }
}

function getArray(ptr, arr, n) {
    return new arr(wasm_memory.buffer, ptr, n);
}

function UTF8ToString(ptr, maxBytesToRead) {
    let u8Array = new Uint8Array(wasm_memory.buffer, ptr);

    var idx = 0;
    var endIdx = idx + maxBytesToRead;

    var str = '';
    while (!(idx >= endIdx)) {
        // For UTF8 byte structure, see:
        // http://en.wikipedia.org/wiki/UTF-8#Description
        // https://www.ietf.org/rfc/rfc2279.txt
        // https://tools.ietf.org/html/rfc3629
        var u0 = u8Array[idx++];

        // If not building with TextDecoder enabled, we don't know the string length, so scan for \0 byte.
        // If building with TextDecoder, we know exactly at what byte index the string ends, so checking for nulls here would be redundant.
        if (!u0) return str;

        if (!(u0 & 0x80)) { str += String.fromCharCode(u0); continue; }
        var u1 = u8Array[idx++] & 63;
        if ((u0 & 0xE0) == 0xC0) { str += String.fromCharCode(((u0 & 31) << 6) | u1); continue; }
        var u2 = u8Array[idx++] & 63;
        if ((u0 & 0xF0) == 0xE0) {
            u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
        } else {

            if ((u0 & 0xF8) != 0xF0) console.warn('Invalid UTF-8 leading byte 0x' + u0.toString(16) + ' encountered when deserializing a UTF-8 string on the asm.js/wasm heap to a JS string!');

            u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | (u8Array[idx++] & 63);
        }

        if (u0 < 0x10000) {
            str += String.fromCharCode(u0);
        } else {
            var ch = u0 - 0x10000;
            str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
        }
    }

    return str;
}

function stringToUTF8(str, heap, outIdx, maxBytesToWrite) {
    var startIdx = outIdx;
    var endIdx = outIdx + maxBytesToWrite;
    for (var i = 0; i < str.length; ++i) {
        // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
        // See http://unicode.org/faq/utf_bom.html#utf16-3
        // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
        var u = str.charCodeAt(i); // possibly a lead surrogate
        if (u >= 0xD800 && u <= 0xDFFF) {
            var u1 = str.charCodeAt(++i);
            u = 0x10000 + ((u & 0x3FF) << 10) | (u1 & 0x3FF);
        }
        if (u <= 0x7F) {
            if (outIdx >= endIdx) break;
            heap[outIdx++] = u;
        } else if (u <= 0x7FF) {
            if (outIdx + 1 >= endIdx) break;
            heap[outIdx++] = 0xC0 | (u >> 6);
            heap[outIdx++] = 0x80 | (u & 63);
        } else if (u <= 0xFFFF) {
            if (outIdx + 2 >= endIdx) break;
            heap[outIdx++] = 0xE0 | (u >> 12);
            heap[outIdx++] = 0x80 | ((u >> 6) & 63);
            heap[outIdx++] = 0x80 | (u & 63);
        } else {
            if (outIdx + 3 >= endIdx) break;

            if (u >= 0x200000) console.warn('Invalid Unicode code point 0x' + u.toString(16) + ' encountered when serializing a JS string to an UTF-8 string on the asm.js/wasm heap! (Valid unicode code points should be in range 0-0x1FFFFF).');

            heap[outIdx++] = 0xF0 | (u >> 18);
            heap[outIdx++] = 0x80 | ((u >> 12) & 63);
            heap[outIdx++] = 0x80 | ((u >> 6) & 63);
            heap[outIdx++] = 0x80 | (u & 63);
        }
    }
    return outIdx - startIdx;
}
var FS = {
    loaded_files: [],
    unique_id: 0
};

var GL = {
    counter: 1,
    buffers: [],
    mappedBuffers: {},
    programs: [],
    framebuffers: [],
    renderbuffers: [],
    textures: [],
    uniforms: [],
    shaders: [],
    vaos: [],
    timerQueries: [],
    contexts: {},
    programInfos: {},

    getNewId: function (table) {
        var ret = GL.counter++;
        for (var i = table.length; i < ret; i++) {
            table[i] = null;
        }
        return ret;
    },

    validateGLObjectID: function (objectHandleArray, objectID, callerFunctionName, objectReadableType) {
        if (objectID != 0) {
            if (objectHandleArray[objectID] === null) {
                console.error(callerFunctionName + ' called with an already deleted ' + objectReadableType + ' ID ' + objectID + '!');
            } else if (!objectHandleArray[objectID]) {
                console.error(callerFunctionName + ' called with an invalid ' + objectReadableType + ' ID ' + objectID + '!');
            }
        }
    },
    getSource: function (shader, count, string, length) {
        var source = '';
        for (var i = 0; i < count; ++i) {
            var len = length == 0 ? undefined : getArray(length + i * 4, Uint32Array, 1)[0];
            source += UTF8ToString(getArray(string + i * 4, Uint32Array, 1)[0], len);
        }
        return source;
    },
    populateUniformTable: function (program) {
        GL.validateGLObjectID(GL.programs, program, 'populateUniformTable', 'program');
        var p = GL.programs[program];
        var ptable = GL.programInfos[program] = {
            uniforms: {},
            maxUniformLength: 0, // This is eagerly computed below, since we already enumerate all uniforms anyway.
            maxAttributeLength: -1, // This is lazily computed and cached, computed when/if first asked, "-1" meaning not computed yet.
            maxUniformBlockNameLength: -1 // Lazily computed as well
        };

        var utable = ptable.uniforms;
        // A program's uniform table maps the string name of an uniform to an integer location of that uniform.
        // The global GL.uniforms map maps integer locations to WebGLUniformLocations.
        var numUniforms = gl.getProgramParameter(p, 0x8B86/*GL_ACTIVE_UNIFORMS*/);
        for (var i = 0; i < numUniforms; ++i) {
            var u = gl.getActiveUniform(p, i);

            var name = u.name;
            ptable.maxUniformLength = Math.max(ptable.maxUniformLength, name.length + 1);

            // If we are dealing with an array, e.g. vec4 foo[3], strip off the array index part to canonicalize that "foo", "foo[]",
            // and "foo[0]" will mean the same. Loop below will populate foo[1] and foo[2].
            if (name.slice(-1) == ']') {
                name = name.slice(0, name.lastIndexOf('['));
            }

            // Optimize memory usage slightly: If we have an array of uniforms, e.g. 'vec3 colors[3];', then
            // only store the string 'colors' in utable, and 'colors[0]', 'colors[1]' and 'colors[2]' will be parsed as 'colors'+i.
            // Note that for the GL.uniforms table, we still need to fetch the all WebGLUniformLocations for all the indices.
            var loc = gl.getUniformLocation(p, name);
            if (loc) {
                var id = GL.getNewId(GL.uniforms);
                utable[name] = [u.size, id];
                GL.uniforms[id] = loc;

                for (var j = 1; j < u.size; ++j) {
                    var n = name + '[' + j + ']';
                    loc = gl.getUniformLocation(p, n);
                    id = GL.getNewId(GL.uniforms);

                    GL.uniforms[id] = loc;
                }
            }
        }
    }
}

function _glGenObject(n, buffers, createFunction, objectTable, functionName) {
    for (var i = 0; i < n; i++) {
        var buffer = gl[createFunction]();
        var id = buffer && GL.getNewId(objectTable);
        if (buffer) {
            buffer.name = id;
            objectTable[id] = buffer;
        } else {
            console.error("GL_INVALID_OPERATION");
            GL.recordError(0x0502 /* GL_INVALID_OPERATION */);

            alert('GL_INVALID_OPERATION in ' + functionName + ': GLctx.' + createFunction + ' returned null - most likely GL context is lost!');
        }
        getArray(buffers + i * 4, Int32Array, 1)[0] = id;
    }
}

function _webglGet(name_, p, type) {
    // Guard against user passing a null pointer.
    // Note that GLES2 spec does not say anything about how passing a null pointer should be treated.
    // Testing on desktop core GL 3, the application crashes on glGetIntegerv to a null pointer, but
    // better to report an error instead of doing anything random.
    if (!p) {
        console.error('GL_INVALID_VALUE in glGet' + type + 'v(name=' + name_ + ': Function called with null out pointer!');
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
    }
    var ret = undefined;
    switch (name_) { // Handle a few trivial GLES values
        case 0x8DFA: // GL_SHADER_COMPILER
            ret = 1;
            break;
        case 0x8DF8: // GL_SHADER_BINARY_FORMATS
            if (type != 'EM_FUNC_SIG_PARAM_I' && type != 'EM_FUNC_SIG_PARAM_I64') {
                GL.recordError(0x500); // GL_INVALID_ENUM

                err('GL_INVALID_ENUM in glGet' + type + 'v(GL_SHADER_BINARY_FORMATS): Invalid parameter type!');
            }
            return; // Do not write anything to the out pointer, since no binary formats are supported.
        case 0x87FE: // GL_NUM_PROGRAM_BINARY_FORMATS
        case 0x8DF9: // GL_NUM_SHADER_BINARY_FORMATS
            ret = 0;
            break;
        case 0x86A2: // GL_NUM_COMPRESSED_TEXTURE_FORMATS
            // WebGL doesn't have GL_NUM_COMPRESSED_TEXTURE_FORMATS (it's obsolete since GL_COMPRESSED_TEXTURE_FORMATS returns a JS array that can be queried for length),
            // so implement it ourselves to allow C++ GLES2 code get the length.
            var formats = gl.getParameter(0x86A3 /*GL_COMPRESSED_TEXTURE_FORMATS*/);
            ret = formats ? formats.length : 0;
            break;
        case 0x821D: // GL_NUM_EXTENSIONS
            assert(false, "unimplemented");
            break;
        case 0x821B: // GL_MAJOR_VERSION
        case 0x821C: // GL_MINOR_VERSION
            assert(false, "unimplemented");
            break;
    }

    if (ret === undefined) {
        var result = gl.getParameter(name_);
        switch (typeof (result)) {
            case "number":
                ret = result;
                break;
            case "boolean":
                ret = result ? 1 : 0;
                break;
            case "string":
                GL.recordError(0x500); // GL_INVALID_ENUM
                console.error('GL_INVALID_ENUM in glGet' + type + 'v(' + name_ + ') on a name which returns a string!');
                return;
            case "object":
                if (result === null) {
                    // null is a valid result for some (e.g., which buffer is bound - perhaps nothing is bound), but otherwise
                    // can mean an invalid name_, which we need to report as an error
                    switch (name_) {
                        case 0x8894: // ARRAY_BUFFER_BINDING
                        case 0x8B8D: // CURRENT_PROGRAM
                        case 0x8895: // ELEMENT_ARRAY_BUFFER_BINDING
                        case 0x8CA6: // FRAMEBUFFER_BINDING
                        case 0x8CA7: // RENDERBUFFER_BINDING
                        case 0x8069: // TEXTURE_BINDING_2D
                        case 0x85B5: // WebGL 2 GL_VERTEX_ARRAY_BINDING, or WebGL 1 extension OES_vertex_array_object GL_VERTEX_ARRAY_BINDING_OES
                        case 0x8919: // GL_SAMPLER_BINDING
                        case 0x8E25: // GL_TRANSFORM_FEEDBACK_BINDING
                        case 0x8514: { // TEXTURE_BINDING_CUBE_MAP
                            ret = 0;
                            break;
                        }
                        default: {
                            GL.recordError(0x500); // GL_INVALID_ENUM
                            console.error('GL_INVALID_ENUM in glGet' + type + 'v(' + name_ + ') and it returns null!');
                            return;
                        }
                    }
                } else if (result instanceof Float32Array ||
                    result instanceof Uint32Array ||
                    result instanceof Int32Array ||
                    result instanceof Array) {
                    for (var i = 0; i < result.length; ++i) {
                        assert(false, "unimplemented")
                    }
                    return;
                } else {
                    try {
                        ret = result.name | 0;
                    } catch (e) {
                        GL.recordError(0x500); // GL_INVALID_ENUM
                        console.error('GL_INVALID_ENUM in glGet' + type + 'v: Unknown object returned from WebGL getParameter(' + name_ + ')! (error: ' + e + ')');
                        return;
                    }
                }
                break;
            default:
                GL.recordError(0x500); // GL_INVALID_ENUM
                console.error('GL_INVALID_ENUM in glGet' + type + 'v: Native code calling glGet' + type + 'v(' + name_ + ') and it returns ' + result + ' of type ' + typeof (result) + '!');
                return;
        }
    }

    switch (type) {
        case 'EM_FUNC_SIG_PARAM_I64': getArray(p, Int32Array, 1)[0] = ret;
        case 'EM_FUNC_SIG_PARAM_I': getArray(p, Int32Array, 1)[0] = ret; break;
        case 'EM_FUNC_SIG_PARAM_F': getArray(p, Float32Array, 1)[0] = ret; break;
        case 'EM_FUNC_SIG_PARAM_B': getArray(p, Int8Array, 1)[0] = ret ? 1 : 0; break;
        default: throw 'internal glGet error, bad type: ' + type;
    }
}

var Module;
var wasm_exports;

function resize(canvas, on_resize) {
    var dpr = dpi_scale();
    var displayWidth = canvas.clientWidth * dpr;
    var displayHeight = canvas.clientHeight * dpr;

    if (canvas.width != displayWidth ||
        canvas.height != displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
        if (on_resize != undefined)
            on_resize(Math.floor(displayWidth), Math.floor(displayHeight))
    }
}

function animation() {
    wasm_exports.frame();
    if (!window.blocking_event_loop) {
        if (animation_frame_timeout) {
            window.cancelAnimationFrame(animation_frame_timeout);
        }
        animation_frame_timeout = window.requestAnimationFrame(animation);
    }
}

const SAPP_EVENTTYPE_TOUCHES_BEGAN = 10;
const SAPP_EVENTTYPE_TOUCHES_MOVED = 11;
const SAPP_EVENTTYPE_TOUCHES_ENDED = 12;
const SAPP_EVENTTYPE_TOUCHES_CANCELED = 13;

const SAPP_MODIFIER_SHIFT = 1;
const SAPP_MODIFIER_CTRL = 2;
const SAPP_MODIFIER_ALT = 4;
const SAPP_MODIFIER_SUPER = 8;

function into_sapp_mousebutton(btn) {
    switch (btn) {
        case 0: return 0;
        case 1: return 2;
        case 2: return 1;
        default: return btn;
    }
}

function into_sapp_keycode(key_code) {
    switch (key_code) {
        case "Space": return 32;
        case "Quote": return 222;
        case "Comma": return 44;
        case "Minus": return 45;
        case "Period": return 46;
        case "Slash": return 189;
        case "Digit0": return 48;
        case "Digit1": return 49;
        case "Digit2": return 50;
        case "Digit3": return 51;
        case "Digit4": return 52;
        case "Digit5": return 53;
        case "Digit6": return 54;
        case "Digit7": return 55;
        case "Digit8": return 56;
        case "Digit9": return 57;
        case "Semicolon": return 59;
        case "Equal": return 61;
        case "KeyA": return 65;
        case "KeyB": return 66;
        case "KeyC": return 67;
        case "KeyD": return 68;
        case "KeyE": return 69;
        case "KeyF": return 70;
        case "KeyG": return 71;
        case "KeyH": return 72;
        case "KeyI": return 73;
        case "KeyJ": return 74;
        case "KeyK": return 75;
        case "KeyL": return 76;
        case "KeyM": return 77;
        case "KeyN": return 78;
        case "KeyO": return 79;
        case "KeyP": return 80;
        case "KeyQ": return 81;
        case "KeyR": return 82;
        case "KeyS": return 83;
        case "KeyT": return 84;
        case "KeyU": return 85;
        case "KeyV": return 86;
        case "KeyW": return 87;
        case "KeyX": return 88;
        case "KeyY": return 89;
        case "KeyZ": return 90;
        case "BracketLeft": return 91;
        case "Backslash": return 92;
        case "BracketRight": return 93;
        case "Backquote": return 96;
        case "Escape": return 256;
        case "Enter": return 257;
        case "Tab": return 258;
        case "Backspace": return 259;
        case "Insert": return 260;
        case "Delete": return 261;
        case "ArrowRight": return 262;
        case "ArrowLeft": return 263;
        case "ArrowDown": return 264;
        case "ArrowUp": return 265;
        case "PageUp": return 266;
        case "PageDown": return 267;
        case "Home": return 268;
        case "End": return 269;
        case "CapsLock": return 280;
        case "ScrollLock": return 281;
        case "NumLock": return 282;
        case "PrintScreen": return 283;
        case "Pause": return 284;
        case "F1": return 290;
        case "F2": return 291;
        case "F3": return 292;
        case "F4": return 293;
        case "F5": return 294;
        case "F6": return 295;
        case "F7": return 296;
        case "F8": return 297;
        case "F9": return 298;
        case "F10": return 299;
        case "F11": return 300;
        case "F12": return 301;
        case "F13": return 302;
        case "F14": return 303;
        case "F15": return 304;
        case "F16": return 305;
        case "F17": return 306;
        case "F18": return 307;
        case "F19": return 308;
        case "F20": return 309;
        case "F21": return 310;
        case "F22": return 311;
        case "F23": return 312;
        case "F24": return 313;
        case "Numpad0": return 320;
        case "Numpad1": return 321;
        case "Numpad2": return 322;
        case "Numpad3": return 323;
        case "Numpad4": return 324;
        case "Numpad5": return 325;
        case "Numpad6": return 326;
        case "Numpad7": return 327;
        case "Numpad8": return 328;
        case "Numpad9": return 329;
        case "NumpadDecimal": return 330;
        case "NumpadDivide": return 331;
        case "NumpadMultiply": return 332;
        case "NumpadSubtract": return 333;
        case "NumpadAdd": return 334;
        case "NumpadEnter": return 335;
        case "NumpadEqual": return 336;
        case "ShiftLeft": return 340;
        case "ControlLeft": return 341;
        case "AltLeft": return 342;
        case "OSLeft": return 343;
        case "ShiftRight": return 344;
        case "ControlRight": return 345;
        case "AltRight": return 346;
        case "OSRight": return 347;
        case "ContextMenu": return 348;
    }

    console.log("Unsupported keyboard key: ", key_code)
}

function dpi_scale() {
    if (high_dpi) {
        return window.devicePixelRatio || 1.0;
    } else {
        return 1.0;
    }
}

function texture_size(internalFormat, width, height) {
    if (internalFormat == gl.ALPHA) {
        return width * height;
    }
    else if (internalFormat == gl.RGB) {
        return width * height * 3;
    } else if (internalFormat == gl.RGBA) {
        return width * height * 4;
    } else { // TextureFormat::RGB565 | TextureFormat::RGBA4 | TextureFormat::RGBA5551
        return width * height * 3;
    }
}

function mouse_relative_position(clientX, clientY) {
    var targetRect = canvas.getBoundingClientRect();

    var x = (clientX - targetRect.left) * dpi_scale();
    var y = (clientY - targetRect.top) * dpi_scale();

    return { x, y };
}

var emscripten_shaders_hack = false;

var importObject = {
    env: {
        console_debug: function (ptr) {
            console.debug(UTF8ToString(ptr));
        },
        console_log: function (ptr) {
            console.log(UTF8ToString(ptr));
        },
        console_info: function (ptr) {
            console.info(UTF8ToString(ptr));
        },
        console_warn: function (ptr) {
            console.warn(UTF8ToString(ptr));
        },
        console_error: function (ptr) {
            console.error(UTF8ToString(ptr));
        },
        set_emscripten_shader_hack: function (flag) {
            emscripten_shaders_hack = flag;
        },
        sapp_set_clipboard: function (ptr, len) {
            clipboard = UTF8ToString(ptr, len);
        },
        dpi_scale,
        rand: function () {
            return Math.floor(Math.random() * 2147483647);
        },
        now: function () {
            return Date.now() / 1000.0;
        },
        canvas_width: function () {
            return Math.floor(canvas.width);
        },
        canvas_height: function () {
            return Math.floor(canvas.height);
        },
        glClearDepthf: function (depth) {
            gl.clearDepth(depth);
        },
        glClearColor: function (r, g, b, a) {
            gl.clearColor(r, g, b, a);
        },
        glClearStencil: function (s) {
            gl.clearStencil(s);
        },
        glColorMask: function (red, green, blue, alpha) {
            gl.colorMask(red, green, blue, alpha);
        },
        glScissor: function (x, y, w, h) {
            gl.scissor(x, y, w, h);
        },
        glClear: function (mask) {
            gl.clear(mask);
        },
        glGenTextures: function (n, textures) {
            _glGenObject(n, textures, "createTexture", GL.textures, "glGenTextures")
        },
        glActiveTexture: function (texture) {
            gl.activeTexture(texture)
        },
        glBindTexture: function (target, texture) {
            GL.validateGLObjectID(GL.textures, texture, 'glBindTexture', 'texture');
            gl.bindTexture(target, GL.textures[texture]);
        },
        glTexImage2D: function (target, level, internalFormat, width, height, border, format, type, pixels) {
            gl.texImage2D(target, level, internalFormat, width, height, border, format, type,
                pixels ? getArray(pixels, Uint8Array, texture_size(internalFormat, width, height)) : null);
        },
        glTexSubImage2D: function (target, level, xoffset, yoffset, width, height, format, type, pixels) {
            gl.texSubImage2D(target, level, xoffset, yoffset, width, height, format, type,
                pixels ? getArray(pixels, Uint8Array, texture_size(format, width, height)) : null);
        },
        glReadPixels: function (x, y, width, height, format, type, pixels) {
            var pixelData = getArray(pixels, Uint8Array, texture_size(format, width, height));
            gl.readPixels(x, y, width, height, format, type, pixelData);
        },
        glTexParameteri: function (target, pname, param) {
            gl.texParameteri(target, pname, param);
        },
        glUniform1fv: function (location, count, value) {
            GL.validateGLObjectID(GL.uniforms, location, 'glUniform1fv', 'location');
            assert((value & 3) == 0, 'Pointer to float data passed to glUniform1fv must be aligned to four bytes!');
            var view = getArray(value, Float32Array, 1 * count);
            gl.uniform1fv(GL.uniforms[location], view);
        },
        glUniform2fv: function (location, count, value) {
            GL.validateGLObjectID(GL.uniforms, location, 'glUniform2fv', 'location');
            assert((value & 3) == 0, 'Pointer to float data passed to glUniform2fv must be aligned to four bytes!');
            var view = getArray(value, Float32Array, 2 * count);
            gl.uniform2fv(GL.uniforms[location], view);
        },
        glUniform3fv: function (location, count, value) {
            GL.validateGLObjectID(GL.uniforms, location, 'glUniform3fv', 'location');
            assert((value & 3) == 0, 'Pointer to float data passed to glUniform3fv must be aligned to four bytes!');
            var view = getArray(value, Float32Array, 3 * count);
            gl.uniform3fv(GL.uniforms[location], view);
        },
        glUniform4fv: function (location, count, value) {
            GL.validateGLObjectID(GL.uniforms, location, 'glUniform4fv', 'location');
            assert((value & 3) == 0, 'Pointer to float data passed to glUniform4fv must be aligned to four bytes!');
            var view = getArray(value, Float32Array, 4 * count);
            gl.uniform4fv(GL.uniforms[location], view);
        },
        glUniform1iv: function (location, count, value) {
            GL.validateGLObjectID(GL.uniforms, location, 'glUniform1fv', 'location');
            assert((value & 3) == 0, 'Pointer to i32 data passed to glUniform1iv must be aligned to four bytes!');
            var view = getArray(value, Int32Array, 1 * count);
            gl.uniform1iv(GL.uniforms[location], view);
        },
        glUniform2iv: function (location, count, value) {
            GL.validateGLObjectID(GL.uniforms, location, 'glUniform2fv', 'location');
            assert((value & 3) == 0, 'Pointer to i32 data passed to glUniform2iv must be aligned to four bytes!');
            var view = getArray(value, Int32Array, 2 * count);
            gl.uniform2iv(GL.uniforms[location], view);
        },
        glUniform3iv: function (location, count, value) {
            GL.validateGLObjectID(GL.uniforms, location, 'glUniform3fv', 'location');
            assert((value & 3) == 0, 'Pointer to i32 data passed to glUniform3iv must be aligned to four bytes!');
            var view = getArray(value, Int32Array, 3 * count);
            gl.uniform3iv(GL.uniforms[location], view);
        },
        glUniform4iv: function (location, count, value) {
            GL.validateGLObjectID(GL.uniforms, location, 'glUniform4fv', 'location');
            assert((value & 3) == 0, 'Pointer to i32 data passed to glUniform4iv must be aligned to four bytes!');
            var view = getArray(value, Int32Array, 4 * count);
            gl.uniform4iv(GL.uniforms[location], view);
        },
        glBlendFunc: function (sfactor, dfactor) {
            gl.blendFunc(sfactor, dfactor);
        },
        glBlendEquationSeparate: function (modeRGB, modeAlpha) {
            gl.blendEquationSeparate(modeRGB, modeAlpha);
        },
        glDisable: function (cap) {
            gl.disable(cap);
        },
        glDrawElements: function (mode, count, type, indices) {
            gl.drawElements(mode, count, type, indices);
        },
        glGetIntegerv: function (name_, p) {
            _webglGet(name_, p, 'EM_FUNC_SIG_PARAM_I');
        },
        glUniform1f: function (location, v0) {
            GL.validateGLObjectID(GL.uniforms, location, 'glUniform1f', 'location');
            gl.uniform1f(GL.uniforms[location], v0);
        },
        glUniform1i: function (location, v0) {
            GL.validateGLObjectID(GL.uniforms, location, 'glUniform1i', 'location');
            gl.uniform1i(GL.uniforms[location], v0);
        },
        glGetAttribLocation: function (program, name) {
            return gl.getAttribLocation(GL.programs[program], UTF8ToString(name));
        },
        glEnableVertexAttribArray: function (index) {
            gl.enableVertexAttribArray(index);
        },
        glDisableVertexAttribArray: function (index) {
            gl.disableVertexAttribArray(index);
        },
        glVertexAttribPointer: function (index, size, type, normalized, stride, ptr) {
            gl.vertexAttribPointer(index, size, type, !!normalized, stride, ptr);
        },
        glVertexAttribIPointer: function (index, size, type, stride, ptr) {
            gl.vertexAttribIPointer(index, size, type, stride, ptr);
        },
        glGetUniformLocation: function (program, name) {
            GL.validateGLObjectID(GL.programs, program, 'glGetUniformLocation', 'program');
            name = UTF8ToString(name);
            var arrayIndex = 0;
            // If user passed an array accessor "[index]", parse the array index off the accessor.
            if (name[name.length - 1] == ']') {
                var leftBrace = name.lastIndexOf('[');
                arrayIndex = name[leftBrace + 1] != ']' ? parseInt(name.slice(leftBrace + 1)) : 0; // "index]", parseInt will ignore the ']' at the end; but treat "foo[]" as "foo[0]"
                name = name.slice(0, leftBrace);
            }

            var uniformInfo = GL.programInfos[program] && GL.programInfos[program].uniforms[name]; // returns pair [ dimension_of_uniform_array, uniform_location ]
            if (uniformInfo && arrayIndex >= 0 && arrayIndex < uniformInfo[0]) { // Check if user asked for an out-of-bounds element, i.e. for 'vec4 colors[3];' user could ask for 'colors[10]' which should return -1.
                return uniformInfo[1] + arrayIndex;
            } else {
                return -1;
            }
        },
        glUniformMatrix4fv: function (location, count, transpose, value) {
            GL.validateGLObjectID(GL.uniforms, location, 'glUniformMatrix4fv', 'location');
            assert((value & 3) == 0, 'Pointer to float data passed to glUniformMatrix4fv must be aligned to four bytes!');
            var view = getArray(value, Float32Array, 16);
            gl.uniformMatrix4fv(GL.uniforms[location], !!transpose, view);
        },
        glUseProgram: function (program) {
            GL.validateGLObjectID(GL.programs, program, 'glUseProgram', 'program');
            gl.useProgram(GL.programs[program]);
        },
        glGenVertexArrays: function (n, arrays) {
            _glGenObject(n, arrays, 'createVertexArray', GL.vaos, 'glGenVertexArrays');
        },
        glGenFramebuffers: function (n, ids) {
            _glGenObject(n, ids, 'createFramebuffer', GL.framebuffers, 'glGenFramebuffers');
        },
        glGenRenderbuffers: function (n, ids) {
            _glGenObject(n, ids, 'createRenderbuffer', GL.renderbuffers, 'glGenRenderbuffers');
        },
        glBindVertexArray: function (vao) {
            gl.bindVertexArray(GL.vaos[vao]);
        },
        glBindFramebuffer: function (target, framebuffer) {
            GL.validateGLObjectID(GL.framebuffers, framebuffer, 'glBindFramebuffer', 'framebuffer');

            gl.bindFramebuffer(target, GL.framebuffers[framebuffer]);
        },
        glBindRenderbuffer: function (target, renderbuffer) {
            GL.validateGLObjectID(GL.renderbuffers, renderbuffer, 'glBindRenderbuffer', 'renderbuffer');

            gl.bindRenderbuffer(target, GL.renderbuffers[renderbuffer]);
        },
        glGenBuffers: function (n, buffers) {
            _glGenObject(n, buffers, 'createBuffer', GL.buffers, 'glGenBuffers');
        },
        glBindBuffer: function (target, buffer) {
            GL.validateGLObjectID(GL.buffers, buffer, 'glBindBuffer', 'buffer');
            gl.bindBuffer(target, GL.buffers[buffer]);
        },
        glBufferData: function (target, size, data, usage) {
            gl.bufferData(target, data ? getArray(data, Uint8Array, size) : size, usage);
        },
        glBufferSubData: function (target, offset, size, data) {
            gl.bufferSubData(target, offset, data ? getArray(data, Uint8Array, size) : size);
        },
        glEnable: function (cap) {
            gl.enable(cap);
        },
        glFlush: function () {
            gl.flush();
        },
        glFinish: function () {
            gl.finish();
        },
        glDepthFunc: function (func) {
            gl.depthFunc(func);
        },
        glBlendFuncSeparate: function (sfactorRGB, dfactorRGB, sfactorAlpha, dfactorAlpha) {
            gl.blendFuncSeparate(sfactorRGB, dfactorRGB, sfactorAlpha, dfactorAlpha);
        },
        glViewport: function (x, y, width, height) {
            gl.viewport(x, y, width, height);
        },
        glDrawArrays: function (mode, first, count) {
            gl.drawArrays(mode, first, count);
        },
        glDrawBuffers: function (n, bufs) {
            gl.drawBuffers(getArray(bufs, Int32Array, n));
        },
        glCreateProgram: function () {
            var id = GL.getNewId(GL.programs);
            var program = gl.createProgram();
            program.name = id;
            GL.programs[id] = program;
            return id;
        },
        glAttachShader: function (program, shader) {
            GL.validateGLObjectID(GL.programs, program, 'glAttachShader', 'program');
            GL.validateGLObjectID(GL.shaders, shader, 'glAttachShader', 'shader');
            gl.attachShader(GL.programs[program], GL.shaders[shader]);
        },
        glDetachShader: function (program, shader) {
            GL.validateGLObjectID(GL.programs, program, 'glDetachShader', 'program');
            GL.validateGLObjectID(GL.shaders, shader, 'glDetachShader', 'shader');
            gl.detachShader(GL.programs[program], GL.shaders[shader]);
        },
        glLinkProgram: function (program) {
            GL.validateGLObjectID(GL.programs, program, 'glLinkProgram', 'program');
            gl.linkProgram(GL.programs[program]);
            GL.populateUniformTable(program);
        },
        glPixelStorei: function (pname, param) {
            gl.pixelStorei(pname, param);
        },
        glFramebufferTexture2D: function (target, attachment, textarget, texture, level) {
            GL.validateGLObjectID(GL.textures, texture, 'glFramebufferTexture2D', 'texture');
            gl.framebufferTexture2D(target, attachment, textarget, GL.textures[texture], level);
        },
        glGetProgramiv: function (program, pname, p) {
            assert(p);
            GL.validateGLObjectID(GL.programs, program, 'glGetProgramiv', 'program');
            if (program >= GL.counter) {
                console.error("GL_INVALID_VALUE in glGetProgramiv");
                return;
            }
            var ptable = GL.programInfos[program];
            if (!ptable) {
                console.error('GL_INVALID_OPERATION in glGetProgramiv(program=' + program + ', pname=' + pname + ', p=0x' + p.toString(16) + '): The specified GL object name does not refer to a program object!');
                return;
            }
            if (pname == 0x8B84) { // GL_INFO_LOG_LENGTH
                var log = gl.getProgramInfoLog(GL.programs[program]);
                assert(log !== null);

                getArray(p, Int32Array, 1)[0] = log.length + 1;
            } else if (pname == 0x8B87 /* GL_ACTIVE_UNIFORM_MAX_LENGTH */) {
                console.error("unsupported operation");
                return;
            } else if (pname == 0x8B8A /* GL_ACTIVE_ATTRIBUTE_MAX_LENGTH */) {
                console.error("unsupported operation");
                return;
            } else if (pname == 0x8A35 /* GL_ACTIVE_UNIFORM_BLOCK_MAX_NAME_LENGTH */) {
                console.error("unsupported operation");
                return;
            } else {
                getArray(p, Int32Array, 1)[0] = gl.getProgramParameter(GL.programs[program], pname);
            }
        },
        glCreateShader: function (shaderType) {
            var id = GL.getNewId(GL.shaders);
            GL.shaders[id] = gl.createShader(shaderType);
            return id;
        },
        glStencilFuncSeparate: function (face, func, ref_, mask) {
            gl.stencilFuncSeparate(face, func, ref_, mask);
        },
        glStencilMaskSeparate: function (face, mask) {
            gl.stencilMaskSeparate(face, mask);
        },
        glStencilOpSeparate: function (face, fail, zfail, zpass) {
            gl.stencilOpSeparate(face, fail, zfail, zpass);
        },
        glFrontFace: function (mode) {
            gl.frontFace(mode);
        },
        glCullFace: function (mode) {
            gl.cullFace(mode);
        },
        glCopyTexImage2D: function (target, level, internalformat, x, y, width, height, border) {
            gl.copyTexImage2D(target, level, internalformat, x, y, width, height, border);
        },

        glShaderSource: function (shader, count, string, length) {
            GL.validateGLObjectID(GL.shaders, shader, 'glShaderSource', 'shader');
            var source = GL.getSource(shader, count, string, length);

            // https://github.com/emscripten-core/emscripten/blob/incoming/src/library_webgl.js#L2708
            if (emscripten_shaders_hack) {
                source = source.replace(/#extension GL_OES_standard_derivatives : enable/g, "");
                source = source.replace(/#extension GL_EXT_shader_texture_lod : enable/g, '');
                var prelude = '';
                if (source.indexOf('gl_FragColor') != -1) {
                    prelude += 'out mediump vec4 GL_FragColor;\n';
                    source = source.replace(/gl_FragColor/g, 'GL_FragColor');
                }
                if (source.indexOf('attribute') != -1) {
                    source = source.replace(/attribute/g, 'in');
                    source = source.replace(/varying/g, 'out');
                } else {
                    source = source.replace(/varying/g, 'in');
                }

                source = source.replace(/textureCubeLodEXT/g, 'textureCubeLod');
                source = source.replace(/texture2DLodEXT/g, 'texture2DLod');
                source = source.replace(/texture2DProjLodEXT/g, 'texture2DProjLod');
                source = source.replace(/texture2DGradEXT/g, 'texture2DGrad');
                source = source.replace(/texture2DProjGradEXT/g, 'texture2DProjGrad');
                source = source.replace(/textureCubeGradEXT/g, 'textureCubeGrad');

                source = source.replace(/textureCube/g, 'texture');
                source = source.replace(/texture1D/g, 'texture');
                source = source.replace(/texture2D/g, 'texture');
                source = source.replace(/texture3D/g, 'texture');
                source = source.replace(/#version 100/g, '#version 300 es\n' + prelude);
            }

            gl.shaderSource(GL.shaders[shader], source);
        },
        glGetProgramInfoLog: function (program, maxLength, length, infoLog) {
            GL.validateGLObjectID(GL.programs, program, 'glGetProgramInfoLog', 'program');
            var log = gl.getProgramInfoLog(GL.programs[program]);
            assert(log !== null);
            let array = getArray(infoLog, Uint8Array, maxLength);
            for (var i = 0; i < maxLength; i++) {
                array[i] = log.charCodeAt(i);
            }
        },
        glGetString: function (id) {
            // getParameter returns "any": it could be GLenum, String or whatever,
            // depending on the id.
            var parameter = gl.getParameter(id).toString();
            var len = parameter.length + 1;
            var msg = wasm_exports.allocate_vec_u8(len);
            var array = new Uint8Array(wasm_memory.buffer, msg, len);
            array[parameter.length] = 0;
            stringToUTF8(parameter, array, 0, len);
            return msg;
        },
        glCompileShader: function (shader, count, string, length) {
            GL.validateGLObjectID(GL.shaders, shader, 'glCompileShader', 'shader');
            gl.compileShader(GL.shaders[shader]);
        },
        glGetShaderiv: function (shader, pname, p) {
            assert(p);
            GL.validateGLObjectID(GL.shaders, shader, 'glGetShaderiv', 'shader');
            if (pname == 0x8B84) { // GL_INFO_LOG_LENGTH
                var log = gl.getShaderInfoLog(GL.shaders[shader]);
                assert(log !== null);

                getArray(p, Int32Array, 1)[0] = log.length + 1;

            } else if (pname == 0x8B88) { // GL_SHADER_SOURCE_LENGTH
                var source = gl.getShaderSource(GL.shaders[shader]);
                var sourceLength = (source === null || source.length == 0) ? 0 : source.length + 1;
                getArray(p, Int32Array, 1)[0] = sourceLength;
            } else {
                getArray(p, Int32Array, 1)[0] = gl.getShaderParameter(GL.shaders[shader], pname);
            }
        },
        glGetShaderInfoLog: function (shader, maxLength, length, infoLog) {
            GL.validateGLObjectID(GL.shaders, shader, 'glGetShaderInfoLog', 'shader');
            var log = gl.getShaderInfoLog(GL.shaders[shader]);
            assert(log !== null);
            let array = getArray(infoLog, Uint8Array, maxLength);
            for (var i = 0; i < maxLength; i++) {
                array[i] = log.charCodeAt(i);
            }
        },
        glVertexAttribDivisor: function (index, divisor) {
            gl.vertexAttribDivisor(index, divisor);
        },
        glDrawArraysInstanced: function (mode, first, count, primcount) {
            gl.drawArraysInstanced(mode, first, count, primcount);
        },
        glDrawElementsInstanced: function (mode, count, type, indices, primcount) {
            gl.drawElementsInstanced(mode, count, type, indices, primcount);
        },
        glDeleteShader: function (shader) {
            var id = GL.shaders[shader];
            if (id == null) { return }
            gl.deleteShader(id);
            GL.shaders[shader] = null
        },
        glDeleteProgram: function (program) {
            var id = GL.programs[program];
            if (id == null) { return }
            gl.deleteProgram(id);
            GL.programs[program] = null
        },
        glDeleteBuffers: function (n, buffers) {
            for (var i = 0; i < n; i++) {
                var id = getArray(buffers + i * 4, Uint32Array, 1)[0];
                var buffer = GL.buffers[id];

                // From spec: "glDeleteBuffers silently ignores 0's and names that do not
                // correspond to existing buffer objects."
                if (!buffer) continue;

                gl.deleteBuffer(buffer);
                buffer.name = 0;
                GL.buffers[id] = null;
            }
        },
        glDeleteFramebuffers: function (n, buffers) {
            for (var i = 0; i < n; i++) {
                var id = getArray(buffers + i * 4, Uint32Array, 1)[0];
                var buffer = GL.framebuffers[id];

                // From spec: "glDeleteFrameBuffers silently ignores 0's and names that do not
                // correspond to existing buffer objects."
                if (!buffer) continue;

                gl.deleteFramebuffer(buffer);
                buffer.name = 0;
                GL.framebuffers[id] = null;
            }
        },
        glDeleteRenderbuffers: function (n, renderbuffers) {
            for (var i = 0; i < n; i++) {
                var id = getArray(renderbuffers + i * 4, Uint32Array, 1)[0];
                var buffer = GL.renderbuffers[id];

                // From spec: "glDeleteRenderbuffers silently ignores 0's and names that do not
                // correspond to existing renderbuffer objects."
                if (!buffer) continue;

                gl.deleteRenderbuffer(buffer);
                buffer.name = 0;
                GL.renderbuffers[id] = null;
            }
        },
        glDeleteTextures: function (n, textures) {
            for (var i = 0; i < n; i++) {
                var id = getArray(textures + i * 4, Uint32Array, 1)[0];
                var texture = GL.textures[id];
                if (!texture) continue; // GL spec: "glDeleteTextures silently ignores 0s and names that do not correspond to existing textures".
                gl.deleteTexture(texture);
                texture.name = 0;
                GL.textures[id] = null;
            }
        },
        glGenQueries: function (n, ids) {
            _glGenObject(n, ids, 'createQuery', GL.timerQueries, 'glGenQueries');
        },
        glDeleteQueries: function (n, ids) {
            for (var i = 0; i < n; i++) {
                var id = getArray(textures + i * 4, Uint32Array, 1)[0];
                var query = GL.timerQueries[id];
                if (!query) {
                    continue;
                }
                gl.deleteQuery(query);
                query.name = 0;
                GL.timerQueries[id] = null;
            }
        },
        glBeginQuery: function (target, id) {
            GL.validateGLObjectID(GL.timerQueries, id, 'glBeginQuery', 'id');
            gl.beginQuery(target, GL.timerQueries[id]);
        },
        glEndQuery: function (target) {
            gl.endQuery(target);
        },
        glGetQueryObjectiv: function (id, pname, ptr) {
            GL.validateGLObjectID(GL.timerQueries, id, 'glGetQueryObjectiv', 'id');
            let result = gl.getQueryObject(GL.timerQueries[id], pname);
            getArray(ptr, Uint32Array, 1)[0] = result;
        },
        glGetQueryObjectui64v: function (id, pname, ptr) {
            GL.validateGLObjectID(GL.timerQueries, id, 'glGetQueryObjectui64v', 'id');
            let result = gl.getQueryObject(GL.timerQueries[id], pname);
            let heap = getArray(ptr, Uint32Array, 2);
            heap[0] = result;
            heap[1] = (result - heap[0]) / 4294967296;
        },
        glGenerateMipmap: function (index) {
            gl.generateMipmap(index);
        },
        glRenderbufferStorageMultisample: function(target, samples, internalformat, width, height) {
            gl.renderbufferStorageMultisample(target, samples, internalformat, width, height);
        },
        glFramebufferRenderbuffer: function(target, attachment, renderbuffertarget, renderbuffer) {
            GL.validateGLObjectID(GL.renderbuffers, renderbuffer, 'glFramebufferRenderbuffer', 'renderbuffer');
            gl.framebufferRenderbuffer(target, attachment, renderbuffertarget, GL.renderbuffers[renderbuffer]);
        },
        glCheckFramebufferStatus: function(target) {
            return gl.checkFramebufferStatus(target);
        },
        glReadBuffer: function(source) {
            gl.readBuffer(source)
        },
        glBlitFramebuffer: function(srcX0, srcY0, srcX1, srcY1,
                                    dstX0, dstY0, dstX1, dstY1,
                                    mask, filter) {
            gl.blitFramebuffer(srcX0, srcY0, srcX1, srcY1,
                               dstX0, dstY0, dstX1, dstY1,
                               mask, filter);
        },

        setup_canvas_size: function (high_dpi) {
            window.high_dpi = high_dpi;
            resize(canvas);
        },
        run_animation_loop: function (blocking) {
            canvas.onmousemove = function (event) {
                var relative_position = mouse_relative_position(event.clientX, event.clientY);
                var x = relative_position.x;
                var y = relative_position.y;

                // TODO: do not send mouse_move when cursor is captured
                wasm_exports.mouse_move(Math.floor(x), Math.floor(y));

                // TODO: check that mouse is captured?
                if (event.movementX != 0 || event.movementY != 0) {
                    wasm_exports.raw_mouse_move(Math.floor(event.movementX), Math.floor(event.movementY));
                }
            };
            canvas.onmousedown = function (event) {
                var relative_position = mouse_relative_position(event.clientX, event.clientY);
                var x = relative_position.x;
                var y = relative_position.y;

                var btn = into_sapp_mousebutton(event.button);
                wasm_exports.mouse_down(x, y, btn);
            };
            // SO WEB SO CONSISTENT
            canvas.addEventListener('wheel',
                function (event) {
                    event.preventDefault();
                    wasm_exports.mouse_wheel(-event.deltaX, -event.deltaY);
                });
            canvas.onmouseup = function (event) {
                var relative_position = mouse_relative_position(event.clientX, event.clientY);
                var x = relative_position.x;
                var y = relative_position.y;

                var btn = into_sapp_mousebutton(event.button);
                wasm_exports.mouse_up(x, y, btn);
            };
            canvas.onkeydown = function (event) {
                var sapp_key_code = into_sapp_keycode(event.code);
                switch (sapp_key_code) {
                    //  space, arrows - prevent scrolling of the page
                    case 32: case 262: case 263: case 264: case 265:
                    // F1-F10
                    case 290: case 291: case 292: case 293: case 294: case 295: case 296: case 297: case 298: case 299:
                    // backspace is Back on Firefox/Windows
                    case 259:
                    // tab - for UI
                    case 258:
                    // quote and slash are Quick Find on Firefox
                    case 39: case 47:
                        event.preventDefault();
                        break;
                }

                var modifiers = 0;
                if (event.ctrlKey) {
                    modifiers |= SAPP_MODIFIER_CTRL;
                }
                if (event.shiftKey) {
                    modifiers |= SAPP_MODIFIER_SHIFT;
                }
                if (event.altKey) {
                    modifiers |= SAPP_MODIFIER_ALT;
                }
                wasm_exports.key_down(sapp_key_code, modifiers, event.repeat);
                // for "space", "quote", and "slash" preventDefault will prevent
                // key_press event, so send it here instead
                if (sapp_key_code == 32 || sapp_key_code == 39 || sapp_key_code == 47) {
                    wasm_exports.key_press(sapp_key_code);
                }
            };
            canvas.onkeyup = function (event) {
                var sapp_key_code = into_sapp_keycode(event.code);

                var modifiers = 0;
                if (event.ctrlKey) {
                    modifiers |= SAPP_MODIFIER_CTRL;
                }
                if (event.shiftKey) {
                    modifiers |= SAPP_MODIFIER_SHIFT;
                }
                if (event.altKey) {
                    modifiers |= SAPP_MODIFIER_ALT;
                }

                wasm_exports.key_up(sapp_key_code, modifiers);
            };
            canvas.onkeypress = function (event) {
                var sapp_key_code = into_sapp_keycode(event.code);

                // firefox do not send onkeypress events for ctrl+keys and delete key while chrome do
                // workaround to make this behavior consistent
                let chrome_only = sapp_key_code == 261 || event.ctrlKey;
                if (chrome_only == false) {
                    wasm_exports.key_press(event.charCode);
                }
            };

            canvas.addEventListener("touchstart", function (event) {
                event.preventDefault();

                for (const touch of event.changedTouches) {
                    let relative_position = mouse_relative_position(touch.clientX, touch.clientY);
                    wasm_exports.touch(SAPP_EVENTTYPE_TOUCHES_BEGAN, touch.identifier, relative_position.x, relative_position.y);
                }
            });
            canvas.addEventListener("touchend", function (event) {
                event.preventDefault();

                for (const touch of event.changedTouches) {
                    let relative_position = mouse_relative_position(touch.clientX, touch.clientY);
                    wasm_exports.touch(SAPP_EVENTTYPE_TOUCHES_ENDED, touch.identifier, relative_position.x, relative_position.y);
                }
            });
            canvas.addEventListener("touchcancel", function (event) {
                event.preventDefault();

                for (const touch of event.changedTouches) {
                    let relative_position = mouse_relative_position(touch.clientX, touch.clientY);
                    wasm_exports.touch(SAPP_EVENTTYPE_TOUCHES_CANCELED, touch.identifier, relative_position.x, relative_position.y);
                }
            });
            canvas.addEventListener("touchmove", function (event) {
                event.preventDefault();

                for (const touch of event.changedTouches) {
                    let relative_position = mouse_relative_position(touch.clientX, touch.clientY);
                    wasm_exports.touch(SAPP_EVENTTYPE_TOUCHES_MOVED, touch.identifier, relative_position.x, relative_position.y);
                }
            });

            window.onresize = function () {
                resize(canvas, wasm_exports.resize);
            };
            window.addEventListener("copy", function (e) {
                if (clipboard != null) {
                    event.clipboardData.setData('text/plain', clipboard);
                    event.preventDefault();
                }
            });
            window.addEventListener("cut", function (e) {
                if (clipboard != null) {
                    event.clipboardData.setData('text/plain', clipboard);
                    event.preventDefault();
                }
            });

            window.addEventListener("paste", function (e) {
                e.stopPropagation();
                e.preventDefault();
                var clipboardData = e.clipboardData || window.clipboardData;
                var pastedData = clipboardData.getData('Text');

                if (pastedData != undefined && pastedData != null && pastedData.length != 0) {
                    var len = (new TextEncoder().encode(pastedData)).length;
                    var msg = wasm_exports.allocate_vec_u8(len);
                    var heap = new Uint8Array(wasm_memory.buffer, msg, len);
                    stringToUTF8(pastedData, heap, 0, len);
                    wasm_exports.on_clipboard_paste(msg, len);
                }
            });

            window.ondragover = function (e) {
                e.preventDefault();
            };

            window.ondrop = async function (e) {
                e.preventDefault();

                wasm_exports.on_files_dropped_start();

                for (let file of e.dataTransfer.files) {
                    const nameLen = file.name.length;
                    const nameVec = wasm_exports.allocate_vec_u8(nameLen);
                    const nameHeap = new Uint8Array(wasm_memory.buffer, nameVec, nameLen);
                    stringToUTF8(file.name, nameHeap, 0, nameLen);

                    const fileBuf = await file.arrayBuffer();
                    const fileLen = fileBuf.byteLength;
                    const fileVec = wasm_exports.allocate_vec_u8(fileLen);
                    const fileHeap = new Uint8Array(wasm_memory.buffer, fileVec, fileLen);
                    fileHeap.set(new Uint8Array(fileBuf), 0);

                    wasm_exports.on_file_dropped(nameVec, nameLen, fileVec, fileLen);
                }

                wasm_exports.on_files_dropped_finish();
            };

            let lastFocus = document.hasFocus();
            var checkFocus = function () {
                let hasFocus = document.hasFocus();
                if (lastFocus == hasFocus) {
                    wasm_exports.focus(hasFocus);
                    lastFocus = hasFocus;
                }
            }
            document.addEventListener("visibilitychange", checkFocus);
            window.addEventListener("focus", checkFocus);
            window.addEventListener("blur", checkFocus);

            window.blocking_event_loop = blocking;
            window.requestAnimationFrame(animation);
        },

        fs_load_file: function (ptr, len) {
            var url = UTF8ToString(ptr, len);
            var file_id = FS.unique_id;
            FS.unique_id += 1;
            var xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.responseType = 'arraybuffer';

            xhr.onreadystatechange = function () {
                // looks like readyState === 4 will be fired on either successful or unsuccessful load:
                // https://stackoverflow.com/a/19247992
                if (this.readyState === 4) {
                    if (this.status === 200) {
                        var uInt8Array = new Uint8Array(this.response);

                        FS.loaded_files[file_id] = uInt8Array;
                        wasm_exports.file_loaded(file_id);
                    } else {
                        FS.loaded_files[file_id] = null;
                        wasm_exports.file_loaded(file_id);
                    }
                }
            };
            xhr.send();

            return file_id;
        },

        fs_get_buffer_size: function (file_id) {
            if (FS.loaded_files[file_id] == null) {
                return -1;
            } else {
                return FS.loaded_files[file_id].length;
            }
        },
        fs_take_buffer: function (file_id, ptr, max_length) {
            var file = FS.loaded_files[file_id];
            console.assert(file.length <= max_length);
            var dest = new Uint8Array(wasm_memory.buffer, ptr, max_length);
            for (var i = 0; i < file.length; i++) {
                dest[i] = file[i];
            }
            delete FS.loaded_files[file_id];
        },
        sapp_set_cursor_grab: function (grab) {
            if (grab) {
                canvas.requestPointerLock();
            } else {
                document.exitPointerLock();
            }
        },
        sapp_set_cursor: function (ptr, len) {
            canvas.style.cursor = UTF8ToString(ptr, len);
        },
        sapp_is_fullscreen: function () {
            let fullscreenElement = document.fullscreenElement;

            return fullscreenElement != null && fullscreenElement.id == canvas.id;
        },
        sapp_set_fullscreen: function (fullscreen) {
            if (!fullscreen) {
                document.exitFullscreen();
            } else {
                canvas.requestFullscreen();
            }
        },
        sapp_set_window_size: function (new_width, new_height) {
            canvas.width = new_width;
            canvas.height = new_height;
            resize(canvas, wasm_exports.resize);
        },
        sapp_schedule_update: function () {
            if (animation_frame_timeout) {
                window.cancelAnimationFrame(animation_frame_timeout);
            }
            animation_frame_timeout = window.requestAnimationFrame(animation);
        },
        init_webgl
    }
};


function register_plugins(plugins) {
    if (plugins == undefined)
        return;

    for (var i = 0; i < plugins.length; i++) {
        if (plugins[i].register_plugin != undefined && plugins[i].register_plugin != null) {
            plugins[i].register_plugin(importObject);
        }
    }
}

function init_plugins(plugins) {
    if (plugins == undefined)
        return;

    for (var i = 0; i < plugins.length; i++) {
        if (plugins[i].on_init != undefined && plugins[i].on_init != null) {
            plugins[i].on_init();
        }
        if (plugins[i].name == undefined || plugins[i].name == null ||
            plugins[i].version == undefined || plugins[i].version == null) {
            console.warn("Some of the registred plugins do not have name or version");
            console.warn("Probably old version of the plugin used");
        } else {
            var version_func = plugins[i].name + "_crate_version";

            if (wasm_exports[version_func] == undefined) {
                console.log("Plugin " + plugins[i].name + " is present in JS bundle, but is not used in the rust code.");
            } else {
                var crate_version = wasm_exports[version_func]();

                if (plugins[i].version != crate_version) {
                    console.error("Plugin " + plugins[i].name + " version mismatch" +
                        "js version: " + plugins[i].version + ", crate version: " + crate_version)
                }
            }
        }
    }
}


function miniquad_add_plugin(plugin) {
    plugins.push(plugin);
}

// read module imports and create fake functions in import object
// this is will allow to successfeully link wasm even with wrong version of gl.js
// needed to workaround firefox bug with lost error on wasm linking errors
function add_missing_functions_stabs(obj) {
    var imports = WebAssembly.Module.imports(obj);

    for (const i in imports) {
        if (importObject["env"][imports[i].name] == undefined) {
            console.warn("No " + imports[i].name + " function in gl.js");
            importObject["env"][imports[i].name] = function () {
                console.warn("Missed function: " + imports[i].name);
            };
        }
    }
}

function load(wasm_path) {
    var req = fetch(wasm_path);

    register_plugins(plugins);

    if (typeof WebAssembly.compileStreaming === 'function') {
        WebAssembly.compileStreaming(req)
            .then(obj => {
                add_missing_functions_stabs(obj);
                return WebAssembly.instantiate(obj, importObject);
            })
            .then(
                obj => {
                    wasm_memory = obj.exports.memory;
                    wasm_exports = obj.exports;

                    var crate_version = wasm_exports.crate_version();
                    if (version != crate_version) {
                        console.error(
                            "Version mismatch: gl.js version is: " + version +
                            ", miniquad crate version is: " + crate_version);
                    }
                    init_plugins(plugins);
                    obj.exports.main();
                })
            .catch(err => {
                console.error(err);
            })
    } else {
        req
            .then(function (x) { return x.arrayBuffer(); })
            .then(function (bytes) { return WebAssembly.compile(bytes); })
            .then(function (obj) {
                add_missing_functions_stabs(obj);
                return WebAssembly.instantiate(obj, importObject);
            })
            .then(function (obj) {
                wasm_memory = obj.exports.memory;
                wasm_exports = obj.exports;

                var crate_version = wasm_exports.crate_version();
                if (version != crate_version) {
                    console.error(
                        "Version mismatch: gl.js version is: " + version +
                        ", rust sapp-wasm crate version is: " + crate_version);
                }
                init_plugins(plugins);
                obj.exports.main();
            })
            .catch(err => {
                console.error("WASM failed to load, probably incompatible gl.js version");
                console.error(err);
            });
    }
}
(function () {
"use strict";

const AudioContext = window.AudioContext || window.webkitAudioContext;
let audio_context;
let sounds = new Map();
let playbacks = [];
let sound_key_next = 1;
let playback_key_next = 1;

function audio_init() {
    if (audio_context == null) {
        audio_context = new AudioContext();
        let audio_listener = audio_context.listener;

        {
            let AudioContext = window.AudioContext || window.webkitAudioContext;
            let ctx = new AudioContext();
            var fixAudioContext = function (e) {
                console.log("fix");

                // On newer Safari AudioContext starts in a suspended state per
                // spec but is only resumable by a call running in an event
                // handler triggered by the user. Do it here. Reference:
                // https://stackoverflow.com/questions/56768576/safari-audiocontext-suspended-even-with-onclick-creation
                audio_context.resume();

                // On older Safari, audio context should be explicitly unpaused
                // in a mouse/touch input event even if it was created after
                // first input event on the page thanks to:
                // https://gist.github.com/kus/3f01d60569eeadefe3a1

                // Create empty buffer
                var buffer = ctx.createBuffer(1, 1, 22050);
                var source = ctx.createBufferSource();
                source.buffer = buffer;
                // Connect to output (speakers)
                source.connect(ctx.destination);
                // Play sound
                if (source.start) {
                    source.start(0);
                } else if (source.play) {
                    source.play(0);
                } else if (source.noteOn) {
                    source.noteOn(0);
                }

                // Remove event handlers
                document.removeEventListener('touchstart', fixAudioContext);
                document.removeEventListener('touchend', fixAudioContext);
                document.removeEventListener('mousedown', fixAudioContext);
                document.removeEventListener('keydown', fixAudioContext);
            };
            // iOS 6-8
            document.addEventListener('touchstart', fixAudioContext);
            // iOS 9
            document.addEventListener('touchend', fixAudioContext);
            // Mac
            document.addEventListener('mousedown', fixAudioContext);
            document.addEventListener('keydown', fixAudioContext);
        }
    }
}

function audio_add_buffer(content, content_len) {
    let content_array = wasm_memory.buffer.slice(content, content + content_len);

    let sound_key = sound_key_next;
    sound_key_next += 1;

    audio_context.decodeAudioData(content_array, function(buffer) {
        sounds.set(sound_key, buffer);
    }, function(e) {
        // fail
        console.error("Failed to decode audio buffer", e);
    });
    return sound_key;
}

function audio_source_is_loaded(sound_key) {
    return sounds.has(sound_key) && sounds.get(sound_key) != undefined;
}

function recycle_playback() {
    let playback = playbacks.find(playback => playback.sound_key === 0);

    if (playback != null) {
        playback.source = audio_context.createBufferSource();
    } else {
        playback = {
            sound_key: 0,
            playback_key: 0,
            source: audio_context.createBufferSource(),
            gain_node: audio_context.createGain(),
            ended: null,
        };

        playbacks.push(playback);
    }

    return playback;
}

function stop(playback) {
    try {
        playback.source.removeEventListener('ended', playback.ended);

        playback.source.disconnect();
        playback.gain_node.disconnect();

        playback.sound_key = 0;
        playback.playback_key = 0;
    } catch (e) {
        console.error("Error stopping sound", e);
    }
}

function audio_play_buffer(sound_key, volume, repeat) {
    let playback_key = playback_key_next++;

    let pb = recycle_playback();

    pb.sound_key = sound_key;
    pb.playback_key = playback_key;

    pb.source.connect(pb.gain_node);
    pb.gain_node.connect(audio_context.destination);

    pb.gain_node.gain.value = volume;
    pb.source.loop = repeat;

    pb.ended = function() {
        stop(pb);
    };
    pb.source.addEventListener('ended', pb.ended);

    try {
        pb.source.buffer = sounds.get(sound_key);
        pb.source.start(0);
    } catch (e) {
        console.error("Error starting sound", e);
    }

    return playback_key;
}

function audio_source_set_volume(sound_key, volume) {
    playbacks.forEach(playback => {
        if (playback.sound_key === sound_key) {
            playback.gain_node.gain.value = volume;
        }
    });
}

function audio_source_stop(sound_key) {
    playbacks.forEach(playback => {
        playback.sound_key === sound_key && stop(playback);
    });
}

function audio_source_delete(sound_key) {
    audio_source_stop(sound_key);

    sounds.delete(sound_key);
}

function audio_playback_stop(playback_key) {
    let playback = playbacks.find(playback => playback.playback_key === playback_key);

    playback != null && stop(playback);
}

function audio_playback_set_volume(playback_key, volume) {
    let playback = playbacks.find(playback => playback.playback_key === playback_key);

    if (playback != null) {
        playback.gain_node.gain.value = volume;
    }
}

function register_plugin(importObject) {
    importObject.env.audio_init = audio_init;
    importObject.env.audio_add_buffer = audio_add_buffer;
    importObject.env.audio_play_buffer = audio_play_buffer;
    importObject.env.audio_source_is_loaded = audio_source_is_loaded;
    importObject.env.audio_source_set_volume = audio_source_set_volume;
    importObject.env.audio_source_stop = audio_source_stop;
    importObject.env.audio_source_delete = audio_source_delete;
    importObject.env.audio_playback_stop = audio_playback_stop;
    importObject.env.audio_playback_set_volume = audio_playback_set_volume;
}

miniquad_add_plugin({ register_plugin, version: 1, name: "macroquad_audio" });
}());
(function () {
"use strict";

var ctx = null;

var js_objects = {};
js_objects[-1] = null;
js_objects[-2] = undefined;
var unique_js_id = 0;

function register_plugin(importObject) {
    importObject.env.js_create_string = function (buf, max_len) {
        var string = UTF8ToString(buf, max_len);
        return js_object(string);
    }

    // Copy given bytes into newly allocated Uint8Array
    importObject.env.js_create_buffer = function (buf, max_len) {
        var src = new Uint8Array(wasm_memory.buffer, buf, max_len);
        var new_buffer = new Uint8Array(new ArrayBuffer(src.byteLength));
        new_buffer.set(new Uint8Array(src));
        return js_object(new_buffer);
    }

    importObject.env.js_create_object = function () {
        var object = {};
        return js_object(object);
    }

    importObject.env.js_set_field_f32 = function (obj_id, buf, max_len, data) {
        var field = UTF8ToString(buf, max_len);

        js_objects[obj_id][field] = data;
    }

    importObject.env.js_set_field_u32 = function (obj_id, buf, max_len, data) {
        var field = UTF8ToString(buf, max_len);

        js_objects[obj_id][field] = data;
    }

    importObject.env.js_set_field_string = function (obj_id, buf, max_len, data_buf, data_len) {
        var field = UTF8ToString(buf, max_len);
        var data = UTF8ToString(data_buf, data_len);

        js_objects[obj_id][field] = data;
    }

    importObject.env.js_unwrap_to_str = function (obj_id, buf, max_len) {
        var str = js_objects[obj_id];
        var utf8array = toUTF8Array(str);
        var length = utf8array.length;
        var dest = new Uint8Array(wasm_memory.buffer, buf, max_len); // with max_len in case of buffer overflow we will panic (I BELIEVE) in js, no UB in rust
        for (var i = 0; i < length; i++) {
            dest[i] = utf8array[i];
        }
    }

    importObject.env.js_unwrap_to_buf = function (obj_id, buf, max_len) {
        var src = js_objects[obj_id];
        var length = src.length;
        var dest = new Uint8Array(wasm_memory.buffer, buf, max_len); 
        for (var i = 0; i < length; i++) {
            dest[i] = src[i];
        }
    }

    // measure length of the string. This function allocates because there is no way
    // go get string byte length in JS 
    importObject.env.js_string_length = function (obj_id) {
        var str = js_objects[obj_id];
        return toUTF8Array(str).length;
    }

    // similar to .length call on Uint8Array in javascript.
    importObject.env.js_buf_length = function (obj_id) {
        var buf = js_objects[obj_id];
        return buf.length;
    }

    importObject.env.js_free_object = function (obj_id) {
        delete js_objects[obj_id];
    }

    importObject.env.js_have_field = function (obj_id, buf, length) {
        var field_name = UTF8ToString(buf, length);

        return js_objects[obj_id][field_name] !== undefined;
    }

    importObject.env.js_field_f32 = function (obj_id, buf, length) {
        var field_name = UTF8ToString(buf, length);

        return js_objects[obj_id][field_name];
    }

    importObject.env.js_field_u32 = function (obj_id, buf, length) {
        var field_name = UTF8ToString(buf, length);

        return js_objects[obj_id][field_name];
    }

    importObject.env.js_field = function (obj_id, buf, length) {
        // UTF8ToString is from gl.js wich should be in the scope now
        var field_name = UTF8ToString(buf, length);

        // apparently .field and ["field"] is the same thing in js
        var field = js_objects[obj_id][field_name];

        return js_object(field);
    }

    importObject.env.js_field_num = function (js_object, buf, length) {
        var field_name = UTF8ToString(buf, length);

        return js_objects[js_object][field_name];
    }
}
miniquad_add_plugin({ register_plugin, version: 1, name: "sapp_jsutils" });

// Its like https://developer.mozilla.org/en-US/docs/Web/API/TextEncoder, 
// but works on more browsers
function toUTF8Array(str) {
    var utf8 = [];
    for (var i = 0; i < str.length; i++) {
        var charcode = str.charCodeAt(i);
        if (charcode < 0x80) utf8.push(charcode);
        else if (charcode < 0x800) {
            utf8.push(0xc0 | (charcode >> 6),
                0x80 | (charcode & 0x3f));
        }
        else if (charcode < 0xd800 || charcode >= 0xe000) {
            utf8.push(0xe0 | (charcode >> 12),
                0x80 | ((charcode >> 6) & 0x3f),
                0x80 | (charcode & 0x3f));
        }
        // surrogate pair
        else {
            i++;
            // UTF-16 encodes 0x10000-0x10FFFF by
            // subtracting 0x10000 and splitting the
            // 20 bits of 0x0-0xFFFFF into two halves
            charcode = 0x10000 + (((charcode & 0x3ff) << 10)
                | (str.charCodeAt(i) & 0x3ff))
            utf8.push(0xf0 | (charcode >> 18),
                0x80 | ((charcode >> 12) & 0x3f),
                0x80 | ((charcode >> 6) & 0x3f),
                0x80 | (charcode & 0x3f));
        }
    }
    return utf8;
}

// Store js object reference to prevent JS garbage collector on destroying it
// And let Rust keep ownership of this reference
// There is no guarantees on JS side of this reference uniqueness, its good idea to use this only on rust functions arguments
function js_object(obj) {
    if (obj == undefined) {
        return -2;
    }
    if (obj === null) {
        return -1;
    }
    var id = unique_js_id;

    js_objects[id] = obj;
    unique_js_id += 1;
    return id;
}

/// Consume the JsObject returned from rust
/// Rust gives us ownership on the object. This method consume ownership from rust to normal JS garbage collector.
function consume_js_object(id) {
    var object = js_objects[id];
    // in JS delete operator does not delete (JS!), the intention here is to remove the value from hashmap, like "js_objects.remove(id)"
    delete js_objects[id];
    return object;
}

/// Get the real object from JsObject returned from rust 
/// Acts like borrowing in rust, but without any checks
/// Be carefull, for most use cases "consume_js_object" is usually better option
function get_js_object(id) {
    return js_objects[id];
}


}());
(function () {
function on_init() {
}

register_plugin = function (importObject) {
    importObject.env.ws_connect = ws_connect;
    importObject.env.ws_is_connected = ws_is_connected;
    importObject.env.ws_send = ws_send;
    importObject.env.ws_try_recv = ws_try_recv;

    importObject.env.http_make_request = http_make_request;
    importObject.env.http_try_recv = http_try_recv;
}

miniquad_add_plugin({ register_plugin, on_init, version: 1, name: "quad_net" });

var quad_socket;
var connected = 0;
var received_buffer = [];

function ws_is_connected() {
    return connected;
}

function ws_connect(addr) {
    quad_socket = new WebSocket(consume_js_object(addr));
    quad_socket.binaryType = 'arraybuffer';
    quad_socket.onopen = function() {
        connected = 1;
    };

    quad_socket.onmessage = function(msg) {
        if (typeof msg.data == "string") {
            received_buffer.push({
                "text": 1,
                "data": msg.data
            });
        } else {
            var buffer = new Uint8Array(msg.data);
            received_buffer.push({
                "text": 0,
                "data": buffer
            });
        }

    }
};

function ws_send(data) {
    var array = consume_js_object(data);
    // here should be a nice typecheck on array.is_string or whatever
    if (array.buffer != undefined) {
        quad_socket.send(array.buffer);
    } else {
        quad_socket.send(array);
    }
};

function ws_try_recv() {
    if (received_buffer.length != 0) {
        return js_object(received_buffer.shift())
    }
    return -1;
}


var uid = 0;
var ongoing_requests = {};

function http_try_recv(cid) {
    if (ongoing_requests[cid] != undefined && ongoing_requests[cid] != null) {
        var data = ongoing_requests[cid];
        ongoing_requests[cid] = null;
        return js_object(data);
    }
    return -1;
}

function http_make_request(scheme, url, body, headers) {
    var cid = uid;

    uid += 1;

    var scheme_string;
    if (scheme == 0) {
        scheme_string = 'POST';
    }
    if (scheme == 1) {
        scheme_string = 'PUT';
    }
    if (scheme == 2) {
        scheme_string = 'GET';
    }
    if (scheme == 3) {
        scheme_string = 'DELETE';
    }
    var url_string = consume_js_object(url);
    var body_string = consume_js_object(body);
    var headers_obj = consume_js_object(headers);
    var xhr = new XMLHttpRequest();
    xhr.open(scheme_string, url_string, true);
    xhr.responseType = 'arraybuffer';
    for (const header in headers_obj) {
        xhr.setRequestHeader(header, headers_obj[header]);
    }
    xhr.onload = function (e) {
        if (this.status == 200) {
            var uInt8Array = new Uint8Array(this.response);
            
            ongoing_requests[cid] = uInt8Array;
        }
    }
    xhr.onerror = function (e) {
        // todo: let rust know and put Error to ongoing requests
        console.error("Failed to make a request");
        console.error(e);
    };

    xhr.send(body_string);

    return cid;
}
}());
