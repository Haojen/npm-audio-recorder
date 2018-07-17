var worker = require('./worker')

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

Recorders.prototype._gotStream = function(stream) {
    const audioContext = new AudioContext()
    const inputPoint = audioContext.createGain()
    const audioInput = audioContext.createMediaStreamSource(stream)
    audioInput.connect(inputPoint);


    const analyserNode = audioContext.createAnalyser()
    analyserNode.fftSize = 2048;
    inputPoint.connect(analyserNode);

    return inputPoint
}

Recorders.prototype._importWorker = function() {
    const blob = new Blob([worker], { type: 'application/javascript' })
    return new Worker(window.URL.createObjectURL(blob))
}

Recorders.prototype.startRecord = function(config = {}) {
    const recorder = this.AudioCtx.context.createScriptProcessor(1024, 1, 1)
    this.AudioCtx.connect(recorder)
    recorder.connect(this.AudioCtx.context.destination)

    this.RECWorker.postMessage({
        command: 'init',
        config: config
    });

    let count = 0, recBuffers = []
    this.RECWorker.onmessage = (e) =>  {
        if (e.data.command === 'stream') {
            let buffer = e.data.buffer;
            let result = new Int16Array(buffer.length);

            for (let i = 0; i < buffer.length; i++) {
                result[i] = buffer[i];
            }

            count++
            recBuffers.push(result)
            if (recBuffers.length > 0 && count === 6) {
                let output = recBuffers.splice(0, recBuffers.length)
                let outputArray = new Int16Array(output.length * 320)

                for (let i = 0; i < output.length; i++) {
                    outputArray.set(output[i], i * 320);
                }

                this.onStreamProcessor && this.onStreamProcessor(outputArray.buffer)
                count = 0;
            }
            return
        }

        if (e.data.command === 'blob') {
            this.onReceiveAudioBlob && this.onReceiveAudioBlob(e.data.blob)
        }
    }

    recorder.onaudioprocess =  (e) => {
        this.RECWorker.postMessage({
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
    this.Recorder.disconnect()
}

Recorders.prototype.clear = function() {
    this.RECWorker.postMessage({command: 'reset'});
}




module.exports = Recorders