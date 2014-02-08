// Board API (in progress):
//
// Connect
// ReadFlash
// WriteFlash

// API
function Avr109Board(serial) {
  if (typeof(serial) === "undefined") {
    console.log(kDebugError, "serial is undefined");
  }
  this.serial_ = serial;
};

Avr109Board.prototype.connect = function(deviceName, doneCb) {
  // TODO: Validate doneCb
  // TODO: Validate deviceName?
  if (this.state_ != Avr109Board.State.DISCONNECTED) {
    doneCb(Status.Error("Can't connect. Current state: " + this.state_));
    return;
  }

  this.state_ = Avr109Board.State.CONNECTING;
  this.kickBootloader_(deviceName, doneCb);
};

Avr109Board.prototype.writeFlash = function(boardAddress, data) {
  if (this.state_ != Avr109Board.CONNECTED) {
    return Status.Error("Not connected to board: " + this.state_);
  }
};

Avr109Board.prototype.readFlash = function(boardAddress) {
  if (this.state_ != Avr109Board.CONNECTED) {
    return Status.Error("Not connected to board: " + this.state_);
  }

  console.log(kDebugError, "Not implemented");
};

// IMPLEMENTATION
Avr109Board.State = {
  DISCONNECTED: "disconnected",
  CONNECTING: "connecting",
  CONNECTED: "connected"
};

Avr109Board.prototype.serial_ = null;
Avr109Board.prototype.state_ = Avr109Board.State.DISCONNECTED;
Avr109Board.prototype.connectionId_ = -1;
Avr109Board.prototype.clock_ = new RealClock;

Avr109Board.MAGIC_BITRATE = 1200;

Avr109Board.prototype.kickBootloader_ = function(originalDeviceName, doneCb) {
  var oldDevices = [];
  var serial = this.serial_;
  var board = this;

  serial.getDevices(function(devicesArg) {
    oldDevices = devicesArg;
    serial.connect(originalDeviceName, {bitrate: Avr109Board.MAGIC_BITRATE }, function(connectArg) {
      // TODO: validate connect arg
      serial.disconnect(connectArg.connectionId, function(disconnectArg) {
        // TODO: validate disconnect arg
        board.waitForNewDevice_(
          oldDevices, doneCb, board.clock_.nowMillis() + 500);
      });
    });
  });
}

function findMissingIn(needles, haystack) {
  var haystack2 = [];
  for (var i = 0; i < haystack.length; ++i) {
    haystack2.push(haystack[i].path);
  }

  var r = [];
  for (var i = 0; i < needles.length; ++i) {
    if (haystack2.indexOf(needles[i].path) == -1) {
      r.push(needles[i].path);
    }
  }

  return r;
}

Avr109Board.prototype.waitForNewDevice_ = function(oldDevices, doneCb, deadline) {
  var serial = this.serial_;
  var board = this;

  if (this.clock_.nowMillis() > deadline) {
    doneCb(Status.Error("Deadline exceeded while waiting for new devices"));
    return;
  }

  var found = false;
  serial.getDevices(function(newDevices) {
    var appeared = findMissingIn(newDevices, oldDevices);
    var disappeared = findMissingIn(oldDevices, newDevices);
 
    for (var i = 0; i < disappeared.length; ++i) {
      log(kDebugNormal, "Disappeared: " + disappeared[i]);
    }
    for (var i = 0; i < appeared.length; ++i) {
      log(kDebugNormal, "Appeared: " + appeared[i]);
    }

    if (appeared.length == 0) {
      setTimeout(function() { board.waitForNewDevice_(newDevices, doneCb, deadline); }, 100);
    } else {
      log(kDebugNormal, "Aha! Connecting to: " + appeared[0]);
      // TODO: really need to settimeout here?
      setTimeout(function() {
        serial.connect(appeared[0], { bitrate: 57600 }, function(connectArg) { board.serialConnected_(connectArg, doneCb) }, 500);
      });
    }
  });
}

Avr109Board.prototype.serialConnected_ = function(connectArg, doneCb) {
  doneCb(Status.OK);
};
