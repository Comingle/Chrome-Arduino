// API
//
// uploadCompiledSketch(parseHexfile(filename), serialportname) ??

function consumeByteAnd(connectionId, callback) {
  chrome.serial.read(connectionId, 1, callback);
}

var STK_OK = 0x10;
var STK_INSYNC = 0x14;

var STK_CRC_EOP = 0x20;

var STK_GET_SYNC = 0x30;
var STK_GET_PARAMETER = 0x41;
var STK_ENTER_PROGMODE = 0x50;
var STK_LEAVE_PROGMODE = 0x51;
var STK_LOAD_ADDRESS = 0x55;
var STK_PROG_PAGE = 0x64;
var STK_READ_SIGN = 0x75;

var STK_HW_VER = 0x80;
var STK_SW_VER_MAJOR = 0x81;
var STK_SW_VER_MINOR = 0x82;

////


function uploadBlinkSketch(serialPort, protocol) {
  log(kDebugFine, "uploading blink sketch");
  fetchProgram('http://linode.mrjon.es/blink.hex', function(programBytes) { 
    log(kDebugFine, "Fetched program. Uploading to: " + serialPort);
    log(kDebugFine, "Protocol: " + protocol);
    uploadCompiledSketch(programBytes, serialPort, protocol);
  });
}

function fetchProgram(url, handler) {
  var xhr = new XMLHttpRequest();
  xhr.onreadystatechange = function() {
    if (xhr.readyState == 4) {
      var programBytes = ParseHexFile(xhr.responseText);
      log(kDebugFine, "Program Data: " + xhr.responseText.substring(0,25) + "...");
      handler(programBytes);
    }
  };
  xhr.open("GET", url, true);
  xhr.send();
}

var sketchData_;
var inSync_ = false;

function uploadCompiledSketch(hexData, serialPortName, protocol) {
  sketchData_ = hexData;
  inSync_ = false;
  if (protocol == "stk500") {
    chrome.serial.open(serialPortName, { bitrate: 57600 }, stkUploadOpenDone);
  } else if (protocol == "avr109") {
    // actually want tocheck that board is leonardo / micro / whatever
    kickLeonardoBootloader(serialPortName);
  } else {
    log(kDebugError, "Unknown protocol: "  + protocol);
  }
}


//
// Internal/implementation
// TODO(mrjones): move into an object/namespace.
//

// Reads a pre-specified number of bytes on the serial port.
//
// The message format expected is:
// STK_INSYNC, <specified number of bytes>, STK_OK
//
// Params:
// - connectionId: the serial connection ID to attempt to read from
// - payloadSize: the number of bytes to read between INSYNC and OK
// - callback: will be called after a read with three arguments:
//   1. int connectionId: the connection that the read was attempted on
//      (this will be the same as the connectionId input param).
//   2. boolean success: true iff a well-formed message was read
//   3. int[] accum: if success is 'true' the payload data read (not
//      including STK_INSYNC or STK_OK.
function stkConsumeMessage(connectionId, payloadSize, callback) {
  var ReadState = {
    READY_FOR_IN_SYNC: 0,
    READY_FOR_PAYLOAD: 1,
    READY_FOR_OK: 2,
    DONE: 3,
    ERROR: 4,
  };

  var accum = [];
  var state = ReadState.READY_FOR_IN_SYNC;
  var kMaxReads = 10;
  var reads = 0;
  var payloadBytesConsumed = 0;

  var handleRead = function(arg) {
    if (reads++ >= kMaxReads) {
      log(kDebugError, "Too many reads. Bailing.");
      return;
    }
    var hexData = binToHex(arg.data);
    if (arg.bytesRead > 0) {
      log(kDebugFine, "[" + connectionId + "] Read: " + hexData);
    } else {
      log(kDebugFine, "No data read.");
    }
    for (var i = 0; i < hexData.length; ++i) {
      if (state == ReadState.READY_FOR_IN_SYNC) {
        if (hexData[i] == STK_INSYNC) {
          if (payloadSize == 0) {
            state = ReadState.READY_FOR_OK;
          } else {
            state = ReadState.READY_FOR_PAYLOAD;
          }
        } else {
//          log(kDebugError, "Expected STK_INSYNC. Got: " + hexData[i] + ". Ignoring.");
//          state = ReadState.ERROR;
        }
      } else if (state == ReadState.READY_FOR_PAYLOAD) {
        accum.push(hexData[i]);
        payloadBytesConsumed++;
        if (payloadBytesConsumed == payloadSize) {
          state = ReadState.READY_FOR_OK;
        } else if (payloadBytesConsumed > payloadSize) {
          state = ReadState.ERROR;
          log(kDebugError, "Read too many payload bytes!");
        }
      } else if (state == ReadState.READY_FOR_OK) {
        if (hexData[i] == STK_OK) {
          state = ReadState.DONE;
        } else {
          log(kDebugError, "Expected STK_OK. Got: " + hexData[i]);
          state = ReadState.ERROR;
        }
      } else if (state == ReadState.DONE) {
        log(kDebugError, "Out of sync");
        state = ReadState.ERROR;
      } else if (state == ReadState.ERROR) {
        log(kDebugError, "In error state. Draining byte: " + hexData[i]);
        // Remains in state ERROR
      } else {
        log(kDebugError, "Unknown state: " + state);
        state = ReadState.ERROR;
      }
    }

    if (state == ReadState.ERROR || state == ReadState.DONE) {
      log(kDebugFine, "Finished in state: " + state);
      callback(connectionId, state == ReadState.DONE, accum);
    } else {
      log(kDebugFine, "Paused in state: " + state + ". Reading again.");

      if (!inSync_ && (reads % 3) == 0) {
        // Mega hack (temporary)
        log(kDebugFine, "Mega Hack: Writing: " + hexRep([STK_GET_SYNC, STK_CRC_EOP]));
        chrome.serial.write(connectionId, hexToBin([STK_GET_SYNC, STK_CRC_EOP]), function() {
            // Don't tight-loop waiting for the message.
//            setTimeout(function() { chrome.serial.read(connectionId, 1024, handleRead); }, 10);
            chrome.serial.read(connectionId, 1024, handleRead);
          });
      } else {
        // Don't tight-loop waiting for the message.
//        setTimeout(function() { chrome.serial.read(connectionId, 1024, handleRead); }, 10);
        chrome.serial.read(connectionId, 1024, handleRead);
      }

    }
  };

  log(kDebugFine, "Scheduling a read in .1s");
  setTimeout(function() { chrome.serial.read(connectionId, 1024, handleRead); }, 10);
//  chrome.serial.read(connectionId, 1024, handleRead);
}

function hexRep(intArray) {
  var buf = "[";
  var sep = "";
  for (var i = 0; i < intArray.length; ++i) {
    buf += (sep + "0x" + intArray[i].toString(16));
    sep = ",";
  }
  buf += "]";
  return buf;
}

// Write a message, and then wait for a reply on a given serial port.
//
// Params:
// - int connectionId: the ID of the serial connection to read and write on
// - int[] outgoingMsg: the data to write on the serial connection. Each entry
//   represents one byte, so ints must be in the range [0-255]. This currently
//   does not append an STK_CRC_EOP at the end of a message, so callers must
//   be sure to include it.
// - int responsePayloadSize: The number of bytes expected in the response
//   message, not including STK_INSYNC or STK_OK (see 
//   'stkConsumeMessage()').
// - callback: See 'callback' in 'stkConsumeMessage()'.
//   
// TODO(mrjones): consider setting STK_CRC_EOP automatically?
function stkWriteThenRead(connectionId, outgoingMsg, responsePayloadSize, callback) {
  log(kDebugNormal, "[" + connectionId + "] Writing: " + hexRep(outgoingMsg));
  var outgoingBinary = hexToBin(outgoingMsg);
  // schedule a read in 100ms
  chrome.serial.write(connectionId, outgoingBinary, function(writeArg) {
      stkConsumeMessage(connectionId, responsePayloadSize, callback);
    });
}

function stkUploadOpenDone(openArg) {
  if (openArg.connectionId == -1) {
    log(kDebugError, "Couldn't connect to board");
    return;
  }

  log(kDebugFine, "Connected to board. ID: " + openArg.connectionId);

  chrome.serial.read(openArg.connectionId, 1024, function(readArg) {
      stkDrainedBytes(readArg, openArg.connectionId);
    });

};

function stkDtrSent(ok, connectionId) {
  if (!ok) {
    log(kDebugError, "Couldn't send DTR");
    return;
  }
  log(kDebugFine, "DTR sent (low) real good");

  chrome.serial.read(connectionId, 1024, function(readArg) {
      stkDrainedAgain(readArg, connectionId);
    });
 
}

function stkDrainedAgain(readArg, connectionId) {
  log(kDebugError, "DRAINED " + readArg.bytesRead + " BYTES");
  if (readArg.bytesRead == 1024) {
    // keep draining
    chrome.serial.read(connectionId, 1024, function(readArg) {
        stkDrainedBytes(readArg, connectionId);
      });
  } else {
    // Start the protocol
    setTimeout(function() { stkWriteThenRead(connectionId, [STK_GET_SYNC, STK_CRC_EOP], 0, stkInSyncWithBoard); }, 50);
  }

}

function stkDrainedBytes(readArg, connectionId) {
  log(kDebugError, "DRAINED " + readArg.bytesRead + " BYTES");
  if (readArg.bytesRead == 1024) {
    // keep draining
    chrome.serial.read(connectionId, 1024, function(readArg) {
        stkDrainedBytes(readArg, connectionId);
      });
  } else {
    log(kDebugFine, "About to set DTR low");
    
    setTimeout(function() {
        chrome.serial.setControlSignals(connectionId, {dtr: false, rts: false}, function(ok) {
            log(kDebugNormal, "sent dtr false, done: " + ok);
            setTimeout(function() {
                chrome.serial.setControlSignals(connectionId, {dtr: true, rts: true}, function(ok) {
                    log(kDebugNormal, "sent dtr true, done: " + ok);
                    setTimeout(function() { stkDtrSent(ok, connectionId); }, 500);
                  });
              }, 500);
          });
      }, 500);
  }
}

function stkInSyncWithBoard(connectionId, ok, data) {
  if (!ok) {
    log(kDebugError, "InSyncWithBoard: NOT OK");
  }
  log(kDebugNormal, "InSyncWithBoard: " + ok + " / " + data);
  inSync_ = true;
  stkWriteThenRead(connectionId, [STK_GET_PARAMETER, STK_HW_VER, STK_CRC_EOP], 1, stkReadHardwareVersion);
}

function stkReadHardwareVersion(connectionId, ok, data) {
  log(kDebugFine, "HardwareVersion: " + ok + " / " + data);
  stkWriteThenRead(connectionId, [STK_GET_PARAMETER, STK_SW_VER_MAJOR, STK_CRC_EOP], 1, stkReadSoftwareMajorVersion);
}

function stkReadSoftwareMajorVersion(connectionId, ok, data) {
  log(kDebugFine, "Software major version: " + ok + " / " + data);
  stkWriteThenRead(connectionId, [STK_GET_PARAMETER, STK_SW_VER_MINOR, STK_CRC_EOP], 1, stkReadSoftwareMinorVersion);
}

function stkReadSoftwareMinorVersion(connectionId, ok, data) {
  log(kDebugFine, "Software minor version: " + ok + " / " + data);
  stkWriteThenRead(connectionId, [STK_ENTER_PROGMODE, STK_CRC_EOP], 0, stkEnteredProgmode);
}

function stkEnteredProgmode(connectionId, ok, data) {
  log(kDebugNormal, "Entered progmode: " + ok + " / " + data);
  stkWriteThenRead(connectionId, [STK_READ_SIGN, STK_CRC_EOP], 3, stkReadSignature);  
}

function stkReadSignature(connectionId, ok, data) {
  log(kDebugFine, "Device signature: " + ok + " / " + data);

  stkProgramFlash(connectionId, sketchData_, 0, 128, stkDoneProgramming);
}

function stkDoneProgramming(connectionId) { 
  stkWriteThenRead(connectionId, [STK_LEAVE_PROGMODE, STK_CRC_EOP], 0, stkLeftProgmode); 
}

function stkLeftProgmode(connectionId, ok, data) {
  log(kDebugNormal, "Left progmode: " + ok + " / " + data);
}

function stkProgramFlash(connectionId, data, offset, length, doneCallback) {
  log(kDebugFine, "program flash: data.length: " + data.length + ", offset: " + offset + ", length: " + length);
  var payload;

  if (offset >= data.length) {
    log(kDebugNormal, "Done programming flash: " + offset + " vs. " + data.length);
    doneCallback(connectionId);
    return;
  }

  if (offset + length > data.length) {
    log(kDebugFine, "Grabbing " + length + " bytes would go past the end.");
    log(kDebugFine, "Grabbing bytes " + offset + " to " + data.length + " bytes would go past the end.");
    payload = data.slice(offset, data.length);
    var padSize = length - payload.length;
    log(kDebugFine, "Padding " + padSize + " 0 byte at the end");
    for (var i = 0; i < padSize; ++i) {
      payload.push(0);
    }
  } else {
    log(kDebugFine, "Grabbing bytes: " + offset + " until " + (offset + length));
    payload = data.slice(offset, offset + length);
  }

  var addressBytes = storeAsTwoBytes(offset / 2); // Word address, verify this
  var sizeBytes = storeAsTwoBytes(length);
  var kFlashMemoryType = 0x46;

  var loadAddressMessage = [
    STK_LOAD_ADDRESS, addressBytes[1], addressBytes[0], STK_CRC_EOP];
  var programMessage = [
    STK_PROG_PAGE, sizeBytes[0], sizeBytes[1], kFlashMemoryType];
  programMessage = programMessage.concat(payload);
  programMessage.push(STK_CRC_EOP);

  stkWriteThenRead(connectionId, loadAddressMessage, 0, function(connectionId, ok, reponse) {
      if (!ok) { log(kDebugError, "Error programming the flash (load address)"); return; }
      stkWriteThenRead(connectionId, programMessage, 0, function(connectionId, ok, response) {
          if (!ok) { log(kDebugError, "Error programming the flash (send data)"); return }
          // Program the next section
          stkProgramFlash(connectionId, data, offset + length, length, doneCallback);
        });
    });
}

function storeAsTwoBytes(n) {
  var lo = (n & 0x00FF);
  var hi = (n & 0xFF00) >> 8;
  log(kDebugFine, "storeTwoBytes(" + n + ") --> [" + hi + "," + lo + "]");
  return [hi, lo];
}

function stkWaitForSync(connectionId) {
  log(kDebugFine, "readying sync bit from: " + connectionId);
  var hex = [STK_GET_SYNC, STK_CRC_EOP];
  var data = hexToBin(hex);
  log(kDebugFine, "writing: " + hex + " -> " + data);
  chrome.serial.write(connectionId, data, function(arg) { checkSync(connectionId, arg) } );
}

function hexToBin(hex) {
  var buffer = new ArrayBuffer(hex.length);
  var bufferView = new Uint8Array(buffer);
  for (var i = 0; i < hex.length; i++) {
    bufferView[i] = hex[i];
  }

  return buffer;
}

function binToHex(bin) {
  var bufferView = new Uint8Array(bin);
  var hexes = [];
  for (var i = 0; i < bufferView.length; ++i) {
    hexes.push(bufferView[i]);
  }
  return hexes;
}

function findMissingNeedlesInHaystack(needles, haystack) {
  var r = [];
  for (var i = 0; i < needles.length; ++i) {
    log(kDebugFine, "needles[" + i + "]: " + needles[i]);
    if (haystack.indexOf(needles[i]) == -1) {
      r.push(needles[i]);
    }
  }

  return r;
}

function waitForNewPort(oldPorts, deadline) {
  log(kDebugFine, "Waiting for new port...");
  if (new Date().getTime() > deadline) {
    log(kDebugError, "Exceeded deadline");
    return;
  }

  var found = false;
  chrome.serial.getPorts(function(newPorts) {
    log(kDebugFine, newPorts.length + " ports");
    var appeared = findMissingNeedlesInHaystack(newPorts, oldPorts);
    var disappeared = findMissingNeedlesInHaystack(oldPorts, newPorts);
 
    log(kDebugFine, "Disappeared: "  + disappeared.length + 
        ", Appeared: " + appeared.length);
     
    for (var i = 0; i < disappeared.length; ++i) {
      log(kDebugNormal, "Disappeared: " + disappeared[i]);
    }
    for (var i = 0; i < appeared.length; ++i) {
      log(kDebugNormal, "Appeared: " + appeared[i]);
    }

    if (appeared.length == 0) {
      log(kDebugFine, "No new ports");
      setTimeout(function() { waitForNewPort(newPorts, deadline); }, 500);
    } else {
      log(kDebugNormal, "Aha! Connecting to: " + appeared[0]);
      chrome.serial.open(appeared[0], { bitrate: 57600 }, avrUploadOpenDone);
    }
  });
}

function kickLeonardoBootloader(originalPortName) {
  log(kDebugNormal, "kickLeonardoBootloader(" + originalPortName + ")");
  var kMagicBaudRate = 1200;
  var oldPorts = [];
  chrome.serial.getPorts(function(portsArg) {
    log(kDebugFine, "Warmed up (enumerated ports)");
    log(kDebugFine, portsArg.length + " ports");
    oldPorts = portsArg;
    chrome.serial.open(originalPortName, { bitrate: kMagicBaudRate }, function(openArg) {
      log(kDebugNormal, "Made sentinel connection to " + originalPortName);
      chrome.serial.close(openArg.connectionId, function(disconnectArg) {
        log(kDebugNormal, "Disconnected from " + originalPortName);
        waitForNewPort(oldPorts, (new Date().getTime()) + 10000);
//        setTimeout(function() {
//          chrome.serial.open(originalPortName, { bitrate: 57600 }, avrUploadOpenDone);
//        }, 300);
      });
    });
  });

}


function avrUploadOpenDone(openArg) {
  if (openArg.connectionId == -1) {
    log(kDebugError, "Couldn't connect to board");
    return;
  }

  log(kDebugFine, "Connected to board. ID: " + openArg.connectionId);

  chrome.serial.read(openArg.connectionId, 1024, function(readArg) {
      avrDrainedBytes(readArg, openArg.connectionId);
    });

};

function avrWaitForBytes(connectionId, n, accum, deadline, callback) {
  if (new Date().getTime() > deadline) {
    log(kDebugError, "Deadline passed while waiting for " + n + " bytes");
    return;
  }
  log(kDebugFine, "Deadline: " + deadline + ", Now: " + (new Date().getTime()));
  log(kDebugNormal, "Waiting for " + n + " bytes");

  var handler = function(readArg) {
    var hexData = binToHex(readArg.data);
    for (var i = 0; i < hexData.length; ++i) {
      accum.push(hexData[i]);
      n--;
    }

    if (n < 0) {
      log(kDebugError, "Read too many bytes !?");
    } else if (n == 0) {
      callback(connectionId, accum);
    } else { // still want more data 
      setTimeout(function() {
        avrWaitForBytes(connectionId, n, accum, deadline, callback);
      });
      // TODO: deadline?
    }
  }

  chrome.serial.read(connectionId, n, handler);
}

function avrWriteThenRead(connectionId, writePayload, readSize, callback) {
  log(kDebugFine, "Writing: " + hexRep(writePayload));
  chrome.serial.write(connectionId, hexToBin(writePayload), function(writeARg) {
    avrWaitForBytes(connectionId, readSize, [], (new Date().getTime()) + 1000,callback);
  });
}

function avrGotVersion(connectionId, version) {
  log(kDebugNormal, "Got version: " + version);
}

function avrDrainedAgain(readArg, connectionId) {
  log(kDebugError, "DRAINED " + readArg.bytesRead + " BYTES");
  if (readArg.bytesRead == 1024) {
    // keep draining
    chrome.serial.read(connectionId, 1024, function(readArg) {
        avrDrainedBytes(readArg, connectionId);
      });
  } else {
    // Start the protocol

    avrWriteThenRead(connectionId, [ 0x56 ], 2, avrGotVersion);
  }
}

function avrDrainedBytes(readArg, connectionId) {
  log(kDebugError, "DRAINED " + readArg.bytesRead + " BYTES");
  if (readArg.bytesRead == 1024) {
    // keep draining
    chrome.serial.read(connectionId, 1024, function(readArg) {
        avrDrainedBytes(readArg, connectionId);
      });
  } else {
    setTimeout(function() { avrDtrSent(true, connectionId); }, 1000);
    /*
    log(kDebugFine, "About to set DTR low");
    
    setTimeout(function() {
        chrome.serial.setControlSignals(connectionId, {dtr: false, rts: false}, function(ok) {
            log(kDebugNormal, "sent dtr false, done: " + ok);
            setTimeout(function() {
                chrome.serial.setControlSignals(connectionId, {dtr: true, rts: true}, function(ok) {
                    log(kDebugNormal, "sent dtr true, done: " + ok);
                    setTimeout(function() { avrDtrSent(ok, connectionId); }, 500);
                  });
              }, 500);
          });
      }, 500);
    */
  }
}

function avrDtrSent(ok, connectionId) {
  if (!ok) {
    log(kDebugError, "Couldn't send DTR");
    return;
  }
  log(kDebugFine, "DTR sent (low) real good");

  chrome.serial.read(connectionId, 1024, function(readArg) {
      avrDrainedAgain(readArg, connectionId);
    });
 
}
