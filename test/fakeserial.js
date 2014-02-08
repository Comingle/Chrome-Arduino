

function FakeSerial() {
  this.onReceive = new FakeSerialReadAdapter(this);
};

FakeSerial.prototype.connect = function(portname, options, doneCb) {
  if (!this.allowConnections_) {
    this.execute_(doneCb, { connectionId: -1 } );
    return;
  }
  this.connected_ = true;
  this.portname_ = portname;
  this.latestBitrate_ = options.bitrate;

  var args = { connectionId: this.connection_id_ };
  this.execute_(doneCb, args);
};

FakeSerial.prototype.disconnect = function(connectionId, doneCb) {
  if (!this.checkConnection(connectionId)) {
    doneCb(Status.Error("FakeSerial connection error."));
    return;
  }

  this.connected_ = false;

  for (var i = 0; i < this.disconnectListeners_.length; ++i) {
    this.disconnectListeners_[i](connectionId);
  }

  this.execute_(doneCb, {});
}

FakeSerial.prototype.setControlSignals = function(connectionId, signals, doneCb) {
  if (!this.checkConnection(connectionId)) {
    doneCb(Status.Error("FakeSerial connection error."));
    return;
  }

  this.controlSignalHistory_.push(
    { time: this.clock_.nowMillis(), signals: signals });

  this.execute_(doneCb, true);
}

FakeSerial.prototype.getDevices = function(doneCb) {
  var devices = [];
  for (var i = 0; i < this.deviceList_.length; ++i) {
    devices.push({path: this.deviceList_[i]});
  }
  this.execute_(doneCb, devices);
}

FakeSerial.prototype.read = function(connectionId, n, doneCb) {
  if (!this.checkConnection(connectionId)) {
    doneCb(Status.Error("FakeSerial connection error."));
  }
};

FakeSerial.prototype.portname_ = null;
FakeSerial.prototype.connection_id_ = 123456;
FakeSerial.prototype.errors_ = [];
FakeSerial.prototype.readListeners_ = [];
FakeSerial.prototype.allowConnections_ = true;
FakeSerial.prototype.clock_ = new RealClock();
FakeSerial.prototype.controlSignalHistory_ = [];
FakeSerial.prototype.deviceList_ = [ "testDevice" ];
FakeSerial.prototype.latestBitrate_ = -1;
FakeSerial.prototype.connected_ = false;
FakeSerial.prototype.disconnectListeners_ = [];

FakeSerial.prototype.addDisconnectListener = function(l) {
  this.disconnectListeners_.push(l);
}

FakeSerial.prototype.checkConnection = function(connectionId) {
  if (!this.connected_) {
    this.errors_.push("FakeSerial is not connected!!");
    return false;
  }

  if (connectionId != this.connection_id_) {
    this.errors_.push(
      "Mismatched connection ID. Expected: '" +
        FakeSerial.connection_id_ + "'. Actual: '" +
        connectionId + "'");
    return false;
  }

  return true;
}

FakeSerial.prototype.setAllowConnections = function(allow) {
  this.allowConnections_ = allow;
}

FakeSerial.prototype.getPortname = function() {
  return portname_;
};

FakeSerial.prototype.execute_ = function(callback, args) {
//  log(kDebugFine, "Executing callback with args: " + JSON.stringify(args));
  callback(args);
};

function FakeSerialReadAdapter(fakeSerial) {
  this.fs_ = fakeSerial;
}

FakeSerialReadAdapter.prototype.addListener = function(listener) {
  this.fs_.readListeners_.push(listener);
  console.log("Num listeners: " + this.fs_.readListeners_.length);
}

FakeSerialReadAdapter.prototype.fs_ = null;
