function Recorders(stream, config) {
  var config = config || {}
  this.config = {
    exportAudio: config.exportAudio,
  }

  this.AudioCtx = this._gotStream(stream)
  this.RECWorker = this._importWorker()
}

Recorders.prototype.onStreamProcessor = null
Recorders.prototype.onReceiveAudioBlob = null
Recorders.prototype.analyserNode = null

Recorders.prototype._gotStream = function(stream) {
  var AudioContext = window.audioContext || window.webkitAudioContext;
  var audioContext = new AudioContext()
  var inputPoint = audioContext.createGain()
  var audioInput = audioContext.createMediaStreamSource(stream)
  audioInput.connect(inputPoint);


  var analyserNode = audioContext.createAnalyser()
  analyserNode.fftSize = 2048;
  inputPoint.connect(analyserNode);
  this.analyserNode = analyserNode;
  
  return inputPoint
}

Recorders.prototype._importWorker = function() {
  var worker = require('./worker')
  var blob = new Blob([worker], { type: 'application/javascript' })
  return new Worker(window.URL.createObjectURL(blob))
}

Recorders.prototype.startRecord = function(config) {
  var recorder = this.AudioCtx.context.createScriptProcessor(1024, 1, 1)
  this.AudioCtx.connect(recorder)
  recorder.connect(this.AudioCtx.context.destination)

  this.RECWorker.postMessage({
    command: 'init',
    config: config || {}
  });

  var count = 0, recBuffers = [], _this = this
  this.RECWorker.onmessage = function(e)  {
    if (e.data.command === 'stream') {
      var buffer = e.data.buffer;
      var result = new Int16Array(buffer.length);

      for (var i = 0; i < buffer.length; i++) {
        result[i] = buffer[i];
      }

      count++
      recBuffers.push(result)
      if (recBuffers.length > 0 && count === 6) {
        var output = recBuffers.splice(0, recBuffers.length)
        var outputArray = new Int16Array(output.length * 320)

        for (var i = 0; i < output.length; i++) {
          outputArray.set(output[i], i * 320);
        }

        _this.onStreamProcessor && _this.onStreamProcessor(outputArray.buffer)
        count = 0;
      }
      return
    }

    if (e.data.command === 'blob') {
      _this.onReceiveAudioBlob && _this.onReceiveAudioBlob(e.data.blob)
    }
  }

  recorder.onaudioprocess =  function(e){
    _this.RECWorker.postMessage({
      command: 'record',
      buffer: e.inputBuffer.getChannelData(0)
    });
  };


  this.Recorder = recorder
}

Recorders.prototype.stopRecord = function() {
  if (this.config.exportAudio && this.config.exportAudio === 'wav') {
    this.RECWorker.postMessage({command: 'exportAudio', type: 'wav'})
  }
  
  this.Recorder && this.Recorder.disconnect()
}

Recorders.prototype.clear = function() {
  this.RECWorker.postMessage({command: 'reset'});
}

module.exports = Recorders
