"use strict";

/*
 * WebSockets telnet client
 * Copyright (C) 2011 Joel Martin
 * Licensed under LGPL-3 (see LICENSE.txt)
 *
 * Includes VT100.js from:
 *   http://code.google.com/p/sshconsole
 * Which was modified from:
 *   http://fzort.org/bi/o.php#vt100_js
 *
 * Telnet protocol:
 *   http://www.networksorcery.com/enp/protocol/telnet.htm
 *   http://www.networksorcery.com/enp/rfc/rfc1091.txt
 *
 * ANSI escape sequeneces:
 *   http://en.wikipedia.org/wiki/ANSI_escape_code
 *   http://ascii-table.com/ansi-escape-sequences-vt-100.php
 *   http://www.termsys.demon.co.uk/vtansi.htm
 *   http://invisible-island.net/xterm/ctlseqs/ctlseqs.html
 *
 * ASCII codes:
 *   http://en.wikipedia.org/wiki/ASCII
 *   http://www.hobbyprojects.com/ascii-table/ascii-table.html
 *
 * Other web consoles:
 *   http://stackoverflow.com/questions/244750/ajax-console-window-with-ansi-vt100-support
 */

function WSZMQ(stype, connect_callback, message_callback, disconnect_callback) {

    var that = {},
        // Public API interface
        ws,
        sQ = [];
    var version = 0;
    var connected_type = '';
    var connected = false;

    Array.prototype.pushStr = function(str) {
        var n = str.length;
        for (var i = 0; i < n; i++) {
            this.push(str.charCodeAt(i));
        }
    };

    function do_send() {
        if (sQ.length > 0) {
            Util.Debug("Sending " + sQ);
            ws.send(sQ);
            sQ = [];
        }
    }

    function ab2str(buf) {
        return String.fromCharCode.apply(null, new Uint8Array(buf));
    }

    function testMessage(arr, tester) {
        var rsize = arr.shift();
        if (rsize == tester.length) {
            return (tester == ab2str(arr.splice(0, rsize)))
        }
        return false;
    }

    function decodeMessage() {
        var start = ws.get_rQi();
        //var data = new DataView(ws.get_rQ()[0], current_message.consumed);
        var more = false;
        var complete = false;
        var len = ws.rQlen();
        //var complete = true;
        Util.Debug("Got a message Length Buffer length is " + ws.rQlen());
        //Last message is done, not waiting on data
        var flag = ws.rQshift8();
        if (flag & 1) {
            Util.Debug("More flag set");
            more = true;
        } else {
            Util.Debug("Last Message");
            more = false;
        }
        var size;
        if (flag & 2) {
            // we are limiting size to 4 gig
            ws.set_rQi(ws.get_rQi() + 4);
            size = ws.rQshift32();
        } else {
            size = ws.rQshift8();
        }
        var arr = null;
        var consumed = ws.get_rQi() - start;

        Util.Debug("Place is " + consumed + " Size " + size + " Length " + ws.rQlen());
        // Do we have enough samples in buffer
        if (consumed + size <= len) {
            arr = new ArrayBuffer(size);
            var blook = new Uint8Array(arr);
            for (var cnt = 0; cnt < size; cnt++) {
                blook[cnt] = ws.rQshift8();
            }
            complete = true;
        } else {
            Util.Debug("Not enough data");
            ws.set_rQi(start);
        }

        return {
            'more': more,
            'complete': complete,
            'data': arr
        };
    }

    function handleMessage(dec) {
        if (dec.data.byteLength < 1000) {
            Util.Debug("Decoded array '" + ab2str(dec.data) + "'");
        } else {
            Util.Debug("Got a good message too long to show");
        }
        if (!(message_callback === undefined)) {
            message_callback(dec);
        }
    }

    function read_message() {
        //var arr = ws.rQshiftBytes(ws.rQlen());
        //Util.Debug(that.connected_type + " got a message array '" + arr + "'");

        var dec;
        dec = decodeMessage();
        while (dec.complete && dec.more) {
            handleMessage(dec);
            dec = decodeMessage();
        }
        if (dec.complete) {
            handleMessage(dec);
        }
    }

    function do_step3() {
        var len = ws.rQlen();
        var arr = ws.rQshiftBytes(len);
        Util.Debug("Step 3 received array '" + arr + "'");
        // This is now a valid zmq message.  However, it is the ready message
        // so I am going to treat it different still
        var resetit = true;
        //Check the flag
        if (arr[0] == 4) {
            arr.shift();
            var rsize = arr.shift();
            if (rsize == arr.length) {
                if (testMessage(arr, 'READY')) {
                    if (testMessage(arr, 'Socket-Type')) {
                        while (arr[0] == 0) {
                            arr.shift();
                        }
                        rsize = arr.shift();
                        var s_type = ab2str(arr.splice(0, rsize));
                        resetit = false; // Good message
                        Util.Debug("Socket is a " + s_type);
                        that.connected_type = s_type;
                        // Should check the type here and make sure we can use it
                        if (testMessage(arr, 'Identity')) {
                            while (arr[0] == 0) {
                                arr.shift();
                            }
                            if (arr.size > 0) {
                                rsize = arr.shift();
                                var id = ab2str(arr.splice(0, rsize));
                                Util.Debug("Socket is identity " + id);
                            }
                        }
                    }
                }
            }
        }

        if (resetit) {
            Util.Error("READY message was not correct");
            that.disconnect();
        } else {
            ws.on('message', read_message);
            connected = true;
            Util.Debug("ZMQ is open, ready to send");
            if (!(connect_callback === undefined)) {
                connect_callback();
            }
            
        }
    }

    function send_socketType(zmqType) {
        sQ.push(4); //Flag
        sQ.push(0); //Length filled below
        sQ.push(5); // READY size
        sQ.pushStr('READY');
        sQ.push(11); // Socket-Type size
        sQ.pushStr('Socket-Type');
        sQ.push(0);
        sQ.push(0);
        sQ.push(0);
        sQ.push(zmqType.length);
        sQ.pushStr(zmqType);
        sQ.push(8);
        sQ.pushStr('Identity');
        sQ.push(0);
        sQ.push(0);
        sQ.push(0);
        sQ.push(0); // we could add a length then identity here
        sQ[1] = sQ.length - 2;
        do_send();
    }

    function do_step2() {
        var len = ws.rQlen();
        var arr = ws.rQshiftBytes(len);
        //Util.Debug("Step 2 received array '" + arr + "'");

        if (version == 0) {
            version = arr[0];
            arr.shift();
            //Util.Debug("Version is " + version);
        }

        if (version != 3) {
            that.disconnect();
            return;
        }

        // We only accept version 3 right now, send out our handshake
        for (var cnt = 0; cnt < 53; cnt++) {
            sQ.push(0);
        }
        sQ[1] = 'N'.charCodeAt(0);
        sQ[2] = 'U'.charCodeAt(0);
        sQ[3] = 'L'.charCodeAt(0);
        sQ[4] = 'L'.charCodeAt(0);
        do_send();

        // Go ahead and send our socket type
        send_socketType(stype);

        arr.shift(); // ignore the minor
        var num = 0;
        while (arr.length > 4) {
            num += arr[4];
            arr.splice(4, 1);
        }
        var security = ab2str(arr);
        var test = (security == 'NULL');

        if (test && num == 0) {
            Util.Debug("Got a good null message");
            ws.on('message', do_step3);
        } else {
            Util.Error("NULL handshake is wrong");
            that.disconnect();
        }

    }

    function do_step1() {
        Util.Debug("Got a message length " + ws.rQlen());
        var len = ws.rQlen();
        var arr = ws.rQshiftBytes(len);
        //Util.Debug("Step 1 received array '" + arr + "'");
        var validGreeting = false;
        if (arr[0] === 0xff) {

            var val = 0;
            for (var cnt = 1; cnt < 8; cnt++) {
                val += arr[cnt];
            }
            Util.Debug("val is " + val);
            if (val == 0) {
                validGreeting = true;
            }
        }

        if (validGreeting) {
            //Util.Debug("Got a valid greeting");
            // The version number can be at end of greeting, but I have seen
            // it on its own or at start of next message
            if (arr.length == 11) {
                version = arr[10];
                //Util.Debug("Version is " + version);
            }
            ws.on('message', do_step2);
        } else {
            Util.Error("Not a valid greeting");
            that.disconnect();
        }
    }

    that.connect = function(host, port, encrypt) {
        var host = host,
            port = port,
            scheme = "ws://",
            uri;

        Util.Debug(">> connect");
        if (!host || !port) {
            console.log("must set host and port");
            return;
        }

        if (ws) {
            ws.close();
            ws.on('message', do_step1);
        }

        if (encrypt) {
            scheme = "wss://";
        }
        uri = scheme + host + ":" + port;
        Util.Info("connecting to " + uri);

        ws.open(uri);

        Util.Debug("<< connect");
    };

    that.disconnect = function() {
        Util.Debug(">> disconnect");
        if (ws) {
            ws.close();
        }
        if (!(disconnect_callback === undefined)) {
            disconnect_callback();
        }
        Util.Debug("<< disconnect");
    };

    that.sendMessage = function(msg, SNDMORE) {
        if (connected) {
            Util.Debug("Sending data");
            //Default is an array of bytes
            var length = msg.length;
            var flag = 0;
            var more = false;
            if (!(message_callback === undefined) && !(SNDMORE == null)) {
                more = SNDMORE;
            }
            if (more) {
                flag |= 1;
            }
            if (length > 255) {
                flag |= 2;
                sQ.push(0);
                sQ.push(0);
                sQ.push(0);
                sQ.push(0);
                // var ulength = ToUint32(length);
                // sQ.push(ulength & 0xff);
                // sQ.push(ulength >> 8 & 0xff);
                // sQ.push(ulength >> 16 & 0xff);
                // sQ.push(ulength >> 24 & 0xff);
                var tmp = new ArrayBuffer(4);
                var blook = new Uint8Array(tmp);
                var dv = new DataView(tmp);
                dv.setUint32(0, length);
                for (var cnt = 0; cnt < 4; cnt++) {
                    sQ.push(blook[cnt]);
                }
            } else {
                sQ.push(flag); // flag
                sQ.push(length); // length
            }
            if (typeof msg === 'string' || msg instanceof String) {
                for (var cnt = 0; cnt < length; cnt++) {
                    sQ.push(msg[cnt].charCodeAt(0));
                }
            } else {
                for (var cnt = 0; cnt < length; cnt++) {
                    sQ.push(msg[cnt]);
                }
            }
            if (!more) {
                do_send();
            }
            // first send flag

        }
    }

    function constructor() {
        /* Initialize Websock object */
        ws = new Websock();
        ws.on('open', function(e) {
            // Send a greeting message
            sQ.push(0xff);
            for (var cnt = 0; cnt < 7; cnt++) {
                sQ.push(0);
            }
            sQ.push(1);
            sQ.push(0x7f);
            sQ.push(3);
            do_send();
        });
        ws.on('close', function(e) {
            Util.Info(">> WebSockets.onclose");
            that.disconnect();
            Util.Info("<< WebSockets.onclose");
        });
        ws.on('error', function(e) {
            Util.Info(">> WebSockets.onerror");
            that.disconnect();
            //setTimeout(function(){ that.connect(); }, 3000);

            Util.Info("<< WebSockets.onerror");
        });

        return that;
    }

    return constructor(); // Return the public API interface
} // End of WSZMQ()