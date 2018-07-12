var worker = require('./worker')

var rec = function(stream, config) {
    this.AudioCtx = this.gotStream(stream)
    this.RECWorker = this._importWorker()
}

rec.prototype.onStreamProcessor = null

rec.prototype.gotStream = function(stream) {
    const audioContext = new AudioContext()
    const inputPoint = audioContext.createGain()
    const audioInput = audioContext.createMediaStreamSource(stream)
    audioInput.connect(inputPoint);

    const analyserNode = audioContext.createAnalyser()
    analyserNode.fftSize = 2048;
    inputPoint.connect(analyserNode);

    return inputPoint
}

rec.prototype._importWorker = function() {
    const blob = new Blob([worker], { type: 'application/javascript' })
    return new Worker(window.URL.createObjectURL(blob))
}

rec.prototype.startRecord = function(config = {}) {
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

                console.log(outputArray.buffer)
                this.onStreamProcessor && this.onStreamProcessor(outputArray.buffer)
                count = 0;
            }
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

rec.prototype.stopRecord = function() {
    this.Recorder.disconnect()
}

rec.prototype.clear = function() {
    this.RECWorker.postMessage({command: 'reset'});
}


module.exports = rec