describe("AVR109 board", function() {
  var board;
  var fakeserial;
  var notified;
  var status;

  var justRecordStatus = function(s) {
    console.log("justRecordStatus(" + JSON.stringify(s) + ")");
    notified = true;
    status = s;
  }

  var ExactMatcher = function(target) {
    this.target_ = target;
  }

  ExactMatcher.prototype.matches = function(candidate) {
    var hexCandidate = binToHex(candidate);
    log(kDebugFine, "Target: " + hexRep(this.target_) + " vs. candidate: " +
        hexRep(hexCandidate));
    if (hexCandidate.length != this.target_.length) {
      return false;
    }

    for (var i = 0; i < this.target_.length; ++i) {
      if (this.target_[i] != hexCandidate[i]) {
        return false;
      }
    }

    return true;
  }

  beforeEach(function() {
    fakeserial = new FakeSerial();
    notified = false;

    board = new Avr109Board(fakeserial);
  });

  it("can't write until connected", function() {
    expect(board.writeFlash(0, [0x00, 0x01]).ok()).toBe(false);
  });

  it("can't read until connected", function() {
    expect(board.readFlash(0).ok()).toBe(false);
  });

  it("connects", function() {
    var sawKickBitrate = false;

    var disconnectListener = function(cid) {
      // magic leonardo bitrate
      sawKickBitrate = (fakeserial.latestBitrate_ == Avr109Board.MAGIC_BITRATE);

      if (sawKickBitrate) {
        setTimeout(function() {
          var popped = fakeserial.deviceList_.pop();
          setTimeout(function() {
            fakeserial.deviceList_.push(popped);
          });
        }, 100);
      }
    };

    runs(function() {
      fakeserial.addDisconnectListener(disconnectListener);
      // TODO: set a correct response
      fakeserial.addMockReply(new ExactMatcher([0x56]),
                              [0x00, 0x01]);
      board.connect("testDevice", justRecordStatus);
    });

    waitsFor(function() {
      return notified;
    }, "Callback should have been called.", 1000);

    runs(function() {
      expect(sawKickBitrate).toBe(true);
      expect(status.ok()).toBe(true);
    });
  });

  xit("reports connection failure", function() {
    runs(function() {
      fakeserial.setAllowConnections(false);
      board.connect("testDevice", justRecordStatus);
    });

    waitsFor(function() {
      return notified;
    }, "Callback should have been called.", 100);

    runs(function() {
      expect(status.ok()).toBe(false);
    });
  });
});
